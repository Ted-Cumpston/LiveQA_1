import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'
import { logAuditAction } from '../../../../../utils/log-audit-action'

interface RestoreReplyBody {
  replyId?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const REPLY_NOT_FOUND_ERROR = 'Reply not found.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<RestoreReplyBody>(event)
  const replyId = body?.replyId ?? ''

  const supabase = useSupabaseServiceRole()

  const { data: reply } = await supabase
    .from('replies')
    .select('id')
    .eq('id', replyId)
    .eq('event_id', eventId)
    .not('deleted_at', 'is', null)
    .maybeSingle()

  if (!reply) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: REPLY_NOT_FOUND_ERROR }
  }

  const { error } = await supabase
    .from('replies')
    .update({ deleted_at: null })
    .eq('id', reply.id)

  if (error) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(callerId, 'reply_restored', eventId, { replyId: reply.id })

  return { success: true, data: { replyId: reply.id }, error: null }
})
