import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../../../utils/verify-administrator'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'
import { slugify, generateJoinCode } from '../../../../../app/utils/generate-event-identifiers'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'
const MAX_ATTEMPTS = 5

export default defineEventHandler(async (event) => {
  const sourceEventId = getRouterParam(event, 'id') ?? ''

  const administratorId = await verifyAdministrator(event)
  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const [sourceEventResult, settingsResult, attendeeTypesResult] = await Promise.all([
    supabase
      .from('events')
      .select('name')
      .eq('id', sourceEventId)
      .single(),
    supabase
      .from('event_settings')
      .select('question_max_length, moderation_mode, hide_vote_counts')
      .eq('event_id', sourceEventId)
      .single(),
    supabase
      .from('attendee_types')
      .select('label')
      .eq('event_id', sourceEventId)
      .is('deleted_at', null)
  ])

  if (!sourceEventResult.data) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  const sourceName = sourceEventResult.data.name
  const sourceSettings = settingsResult.data
  const sourceLabels = (attendeeTypesResult.data ?? []).map(t => t.label)

  let attempt = 0
  while (attempt < MAX_ATTEMPTS) {
    attempt++

    const { data: newEvent, error } = await supabase
      .from('events')
      .insert({
        name: `${sourceName} (Copy)`,
        slug: slugify(sourceName),
        join_code: generateJoinCode(),
        created_by: administratorId
      })
      .select('id')
      .single()

    if (!error && newEvent) {
      const { error: settingsError } = await supabase
        .from('event_settings')
        .insert({
          event_id: newEvent.id,
          question_max_length: sourceSettings?.question_max_length ?? 500,
          moderation_mode: sourceSettings?.moderation_mode ?? 'queue',
          hide_vote_counts: sourceSettings?.hide_vote_counts ?? false
        })

      if (settingsError) {
        setResponseStatus(event, 500)
        return { success: false, data: null, error: GENERIC_ERROR }
      }

      if (sourceLabels.length) {
        const { error: typesError } = await supabase
          .from('attendee_types')
          .insert(sourceLabels.map(label => ({ event_id: newEvent.id, label })))

        if (typesError) {
          setResponseStatus(event, 500)
          return { success: false, data: null, error: GENERIC_ERROR }
        }
      }

      await logAuditAction(administratorId, 'event_duplicated', newEvent.id, { duplicatedFromEventId: sourceEventId })

      return { success: true, data: { eventId: newEvent.id }, error: null }
    }

    if (error?.code !== '23505') {
      setResponseStatus(event, 500)
      return { success: false, data: null, error: GENERIC_ERROR }
    }
  }

  setResponseStatus(event, 500)
  return { success: false, data: null, error: GENERIC_ERROR }
})
