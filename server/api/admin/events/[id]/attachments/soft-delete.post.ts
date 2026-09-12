import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'
import { logAuditAction } from '../../../../../utils/log-audit-action'

interface SoftDeleteAttachmentBody {
  attachmentId?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const ATTACHMENT_NOT_FOUND_ERROR = 'Attachment not found.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<SoftDeleteAttachmentBody>(event)
  const attachmentId = body?.attachmentId ?? ''

  const supabase = useSupabaseServiceRole()

  const { data: attachment } = await supabase
    .from('attachments')
    .select('id, questions!inner(event_id)')
    .eq('id', attachmentId)
    .eq('questions.event_id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!attachment) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: ATTACHMENT_NOT_FOUND_ERROR }
  }

  const { error } = await supabase
    .from('attachments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', attachment.id)

  if (error) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(callerId, 'attachment_soft_deleted', eventId, { attachmentId: attachment.id })

  return { success: true, data: { attachmentId: attachment.id }, error: null }
})
