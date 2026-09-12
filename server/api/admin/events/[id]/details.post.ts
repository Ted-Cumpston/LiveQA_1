import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'
import { normalizeSlug, isValidSlug, normalizeJoinCode, isValidJoinCode } from '../../../../../app/utils/generate-event-identifiers'

interface SaveDetailsBody {
  name?: string
  slug?: string
  joinCode?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const NAME_REQUIRED_ERROR = 'Name is required.'
const SLUG_INVALID_ERROR = 'Slug must be 1-63 characters: lowercase letters, numbers, and hyphens only, no leading or trailing hyphen.'
const JOIN_CODE_INVALID_ERROR = 'Join code must be exactly 6 letters and/or numbers.'
const DUPLICATE_ERROR = 'That slug or join code is already in use. Please choose different values.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<SaveDetailsBody>(event)
  const name = (body?.name ?? '').trim()

  if (!name) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: NAME_REQUIRED_ERROR }
  }

  const normalizedSlug = normalizeSlug(body?.slug ?? '')
  if (!isValidSlug(normalizedSlug)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: SLUG_INVALID_ERROR }
  }

  const normalizedJoinCode = normalizeJoinCode(body?.joinCode ?? '')
  if (!isValidJoinCode(normalizedJoinCode)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: JOIN_CODE_INVALID_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { error, data } = await supabase
    .from('events')
    .update({ name, slug: normalizedSlug, join_code: normalizedJoinCode })
    .eq('id', eventId)
    .select('id')

  if (error) {
    setResponseStatus(event, error.code === '23505' ? 409 : 500)
    return { success: false, data: null, error: error.code === '23505' ? DUPLICATE_ERROR : GENERIC_ERROR }
  }

  if (!data?.length) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(callerId, 'event_details_updated', eventId, { name, slug: normalizedSlug, joinCode: normalizedJoinCode })

  return { success: true, data: { slug: normalizedSlug, joinCode: normalizedJoinCode }, error: null }
})
