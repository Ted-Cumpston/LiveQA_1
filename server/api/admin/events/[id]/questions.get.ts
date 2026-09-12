import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: allQuestions } = await supabase
    .from('questions')
    .select('id, text, created_at, attendee_id, approval_status, visibility, answered, archived, deleted_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  const questions = allQuestions ?? []
  const questionIds = questions.map(q => q.id)

  const attendeeIds = [...new Set(questions.map(q => q.attendee_id))]

  const { data: submitters } = await supabase
    .from('attendees')
    .select('id, display_name')
    .in('id', attendeeIds.length ? attendeeIds : [''])

  const submitterNameById = new Map((submitters ?? []).map(a => [a.id, a.display_name]))

  const { data: revisions } = await supabase
    .from('question_revisions')
    .select('id, question_id, original_text, revised_text, edited_by, created_at')
    .in('question_id', questionIds.length ? questionIds : [''])
    .order('created_at', { ascending: true })

  const editorIds = [...new Set((revisions ?? []).map(r => r.edited_by))]

  const { data: editors } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', editorIds.length ? editorIds : [''])

  const editorEmailById = new Map((editors ?? []).map(p => [p.id, p.email]))

  const revisionsByQuestionId = new Map<string, { id: string, originalText: string, revisedText: string, editedByEmail: string | null, createdAt: string }[]>()
  for (const r of revisions ?? []) {
    const list = revisionsByQuestionId.get(r.question_id) ?? []
    list.push({
      id: r.id,
      originalText: r.original_text,
      revisedText: r.revised_text,
      editedByEmail: editorEmailById.get(r.edited_by) ?? null,
      createdAt: r.created_at
    })
    revisionsByQuestionId.set(r.question_id, list)
  }

  const { data: replies } = await supabase
    .from('replies')
    .select('id, question_id, text, created_at, attendee_id, approval_status, visibility, deleted_at')
    .in('question_id', questionIds.length ? questionIds : [''])
    .order('created_at', { ascending: true })

  const replyAttendeeIds = [...new Set((replies ?? []).map(r => r.attendee_id).filter((id): id is string => id !== null))]

  const { data: replyAuthors } = await supabase
    .from('attendees')
    .select('id, display_name')
    .in('id', replyAttendeeIds.length ? replyAttendeeIds : [''])

  const replyAuthorNameById = new Map((replyAuthors ?? []).map(a => [a.id, a.display_name]))

  const activeRepliesByQuestionId = new Map<string, { id: string, text: string, approvalStatus: string, visibility: string, displayName: string | null, createdAt: string }[]>()
  const deletedRepliesByQuestionId = new Map<string, { id: string, text: string, approvalStatus: string, visibility: string, displayName: string | null, createdAt: string }[]>()
  for (const r of replies ?? []) {
    const row = {
      id: r.id,
      text: r.text,
      approvalStatus: r.approval_status,
      visibility: r.visibility,
      displayName: r.attendee_id ? replyAuthorNameById.get(r.attendee_id) ?? null : 'Moderator',
      createdAt: r.created_at
    }
    const map = r.deleted_at ? deletedRepliesByQuestionId : activeRepliesByQuestionId
    const list = map.get(r.question_id) ?? []
    list.push(row)
    map.set(r.question_id, list)
  }

  const { data: attachments } = await supabase
    .from('attachments')
    .select('id, question_id, storage_path, mime_type, size_bytes, created_at, deleted_at')
    .in('question_id', questionIds.length ? questionIds : [''])
    .order('created_at', { ascending: true })

  const attachmentPaths = (attachments ?? []).map(a => a.storage_path)
  const { data: signedAttachmentUrls } = attachmentPaths.length
    ? await supabase.storage.from('question-attachments').createSignedUrls(attachmentPaths, 3600)
    : { data: [] }

  const attachmentSignedUrlByPath = new Map((signedAttachmentUrls ?? []).map(s => [s.path, s.signedUrl]))

  const activeAttachmentsByQuestionId = new Map<string, { id: string, mimeType: string, sizeBytes: number, viewUrl: string | null, createdAt: string }[]>()
  const deletedAttachmentsByQuestionId = new Map<string, { id: string, mimeType: string, sizeBytes: number, viewUrl: string | null, createdAt: string }[]>()
  for (const a of attachments ?? []) {
    const row = {
      id: a.id,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      viewUrl: attachmentSignedUrlByPath.get(a.storage_path) ?? null,
      createdAt: a.created_at
    }
    const map = a.deleted_at ? deletedAttachmentsByQuestionId : activeAttachmentsByQuestionId
    const list = map.get(a.question_id) ?? []
    list.push(row)
    map.set(a.question_id, list)
  }

  const toRow = (q: typeof questions[number]) => ({
    id: q.id,
    text: q.text,
    createdAt: q.created_at,
    approvalStatus: q.approval_status,
    visibility: q.visibility,
    answered: q.answered,
    archived: q.archived,
    displayName: submitterNameById.get(q.attendee_id) ?? null,
    revisions: revisionsByQuestionId.get(q.id) ?? [],
    replies: activeRepliesByQuestionId.get(q.id) ?? [],
    deletedReplies: deletedRepliesByQuestionId.get(q.id) ?? [],
    attachments: activeAttachmentsByQuestionId.get(q.id) ?? [],
    deletedAttachments: deletedAttachmentsByQuestionId.get(q.id) ?? []
  })

  const result = questions.filter(q => !q.deleted_at).map(toRow)
  const deletedResult = questions.filter(q => q.deleted_at).map(toRow)

  return { success: true, data: { questions: result, deletedQuestions: deletedResult }, error: null }
})
