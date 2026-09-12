import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'
import { logAuditAction } from '../../../../../utils/log-audit-action'

interface PermanentDeleteAttachmentBody {
  attachmentId?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const ATTACHMENT_NOT_FOUND_ERROR = 'Attachment not found.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

const ATTACHMENTS_BUCKET = 'question-attachments'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<PermanentDeleteAttachmentBody>(event)
  const attachmentId = body?.attachmentId ?? ''

  const supabase = useSupabaseServiceRole()

  const { data: attachment } = await supabase
    .from('attachments')
    .select('id, storage_path, questions!inner(event_id)')
    .eq('id', attachmentId)
    .eq('questions.event_id', eventId)
    .maybeSingle()

  if (!attachment) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: ATTACHMENT_NOT_FOUND_ERROR }
  }

  const { error } = await supabase
    .from('attachments')
    .delete()
    .eq('id', attachment.id)

  if (error) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await supabase.storage.from(ATTACHMENTS_BUCKET).remove([attachment.storage_path])

  await logAuditAction(callerId, 'attachment_permanently_deleted', eventId, { attachmentId: attachment.id })

  return { success: true, data: { attachmentId: attachment.id }, error: null }
})
