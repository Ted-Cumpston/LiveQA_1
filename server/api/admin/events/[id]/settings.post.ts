import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'

interface SaveSettingsBody {
  questionMaxLength?: number
  moderationMode?: 'immediate' | 'queue'
  hideVoteCounts?: boolean
  requireAttendeeName?: boolean
  requireAttendeeType?: boolean
  duplicateCheckStrictness?: 'off' | 'low' | 'medium' | 'high'
  attendeeEditWindowMinutes?: number
  anonymityMode?: 'named' | 'optional' | 'always'
  showAttendeeType?: boolean
  attachmentMaxCount?: number
  attachmentMaxSizeBytes?: number
  abuseProtectionTier?: 'open' | 'standard' | 'strict'
  submissionsOpen?: boolean
  votingOpen?: boolean
  moderatorAccessEnabled?: boolean
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const QUESTION_MAX_LENGTH_ERROR = 'Max question length must be a positive whole number.'
const ATTENDEE_EDIT_WINDOW_ERROR = 'Attendee edit window must be a whole number of minutes, 0 or more.'
const ATTACHMENT_MAX_COUNT_ERROR = 'Max attachments per question must be a whole number, 0 or more.'
const ATTACHMENT_MAX_SIZE_ERROR = 'Max attachment size must be a whole number of bytes, 0 or more.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<SaveSettingsBody>(event)

  const questionMaxLength = body?.questionMaxLength ?? 0
  if (!Number.isInteger(questionMaxLength) || questionMaxLength <= 0) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: QUESTION_MAX_LENGTH_ERROR }
  }

  const attendeeEditWindowMinutes = body?.attendeeEditWindowMinutes ?? -1
  if (!Number.isInteger(attendeeEditWindowMinutes) || attendeeEditWindowMinutes < 0) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: ATTENDEE_EDIT_WINDOW_ERROR }
  }

  const attachmentMaxCount = body?.attachmentMaxCount ?? -1
  if (!Number.isInteger(attachmentMaxCount) || attachmentMaxCount < 0) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: ATTACHMENT_MAX_COUNT_ERROR }
  }

  const attachmentMaxSizeBytes = body?.attachmentMaxSizeBytes ?? -1
  if (!Number.isInteger(attachmentMaxSizeBytes) || attachmentMaxSizeBytes < 0) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: ATTACHMENT_MAX_SIZE_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const [settingsResult, eventResult] = await Promise.all([
    supabase
      .from('event_settings')
      .update({
        question_max_length: questionMaxLength,
        moderation_mode: body?.moderationMode ?? 'queue',
        hide_vote_counts: body?.hideVoteCounts ?? false,
        require_attendee_name: body?.requireAttendeeName ?? false,
        require_attendee_type: body?.requireAttendeeType ?? false,
        duplicate_check_strictness: body?.duplicateCheckStrictness ?? 'off',
        attendee_edit_window_minutes: attendeeEditWindowMinutes,
        anonymity_mode: body?.anonymityMode ?? 'always',
        show_attendee_type: body?.showAttendeeType ?? false,
        attachment_max_count: attachmentMaxCount,
        attachment_max_size_bytes: attachmentMaxSizeBytes,
        abuse_protection_tier: body?.abuseProtectionTier ?? 'standard'
      })
      .eq('event_id', eventId)
      .select('event_id'),
    supabase
      .from('events')
      .update({
        submissions_open: body?.submissionsOpen ?? false,
        voting_open: body?.votingOpen ?? false,
        moderator_access_enabled: body?.moderatorAccessEnabled ?? false
      })
      .eq('id', eventId)
      .select('id')
  ])

  if (settingsResult.error || eventResult.error || !settingsResult.data?.length || !eventResult.data?.length) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(callerId, 'event_settings_updated', eventId, {})

  return { success: true, data: null, error: null }
})
