import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../utils/verify-administrator'
import { useSupabaseServiceRole } from '../../utils/supabase'
import { logAuditAction } from '../../utils/log-audit-action'
import { slugify, generateJoinCode } from '../../../app/utils/generate-event-identifiers'

interface CreateEventBody {
  name?: string
  templateId?: string | null
}

interface TemplateConfig {
  questionMaxLength: number
  moderationMode: 'immediate' | 'queue'
  hideVoteCounts: boolean
  attendeeTypes: string[]
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const NAME_REQUIRED_ERROR = 'Name is required.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'
const MAX_ATTEMPTS = 5

export default defineEventHandler(async (event) => {
  const administratorId = await verifyAdministrator(event)
  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<CreateEventBody>(event)
  const name = (body?.name ?? '').trim()
  const templateId = body?.templateId ?? null

  if (!name) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NAME_REQUIRED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  let attempt = 0
  while (attempt < MAX_ATTEMPTS) {
    attempt++

    const { data, error } = await supabase
      .from('events')
      .insert({
        name,
        slug: slugify(name),
        join_code: generateJoinCode(),
        created_by: administratorId
      })
      .select('id, slug, join_code')
      .single()

    if (!error && data) {
      let attendeeTypes: { id: string, label: string }[] = []

      if (templateId) {
        const { data: template } = await supabase
          .from('event_templates')
          .select('config')
          .eq('id', templateId)
          .single()

        const config = template?.config as TemplateConfig | undefined

        const { error: settingsError } = await supabase
          .from('event_settings')
          .insert({
            event_id: data.id,
            question_max_length: config?.questionMaxLength ?? 500,
            moderation_mode: config?.moderationMode ?? 'queue',
            hide_vote_counts: config?.hideVoteCounts ?? false
          })

        if (settingsError) {
          setResponseStatus(event, 500)
          return { success: false, data: null, error: GENERIC_ERROR }
        }

        if (config?.attendeeTypes?.length) {
          const { data: insertedTypes, error: typesError } = await supabase
            .from('attendee_types')
            .insert(config.attendeeTypes.map(label => ({ event_id: data.id, label })))
            .select('id, label')

          if (typesError) {
            setResponseStatus(event, 500)
            return { success: false, data: null, error: GENERIC_ERROR }
          }

          attendeeTypes = insertedTypes ?? []
        }
      } else {
        const { error: settingsError } = await supabase
          .from('event_settings')
          .insert({ event_id: data.id })

        if (settingsError) {
          setResponseStatus(event, 500)
          return { success: false, data: null, error: GENERIC_ERROR }
        }
      }

      await logAuditAction(administratorId, 'event_created', data.id, { name, templateId })

      return {
        success: true,
        data: { eventId: data.id, slug: data.slug, joinCode: data.join_code, attendeeTypes },
        error: null
      }
    }

    if (error?.code !== '23505') {
      setResponseStatus(event, 500)
      return { success: false, data: null, error: GENERIC_ERROR }
    }
  }

  setResponseStatus(event, 500)
  return { success: false, data: null, error: GENERIC_ERROR }
})
