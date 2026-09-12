import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../../../../utils/verify-administrator'
import { useSupabaseServiceRole } from '../../../../../utils/supabase'
import { logAuditAction } from '../../../../../utils/log-audit-action'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const ASSIGNMENT_NOT_FOUND_ERROR = 'Assignment not found.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const assignmentId = getRouterParam(event, 'assignmentId') ?? ''

  const administratorId = await verifyAdministrator(event)
  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { data: assignment } = await supabase
    .from('event_manager_assignments')
    .select('id, event_manager_id, event_id')
    .eq('id', assignmentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!assignment) {
    setResponseStatus(event, 404)
    return { success: false, data: null, error: ASSIGNMENT_NOT_FOUND_ERROR }
  }

  const { error } = await supabase
    .from('event_manager_assignments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', assignment.id)

  if (error) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(administratorId, 'event_manager_assignment_removed', assignment.event_id, {
    eventManagerId: assignment.event_manager_id,
    assignmentId: assignment.id
  })

  return { success: true, data: null, error: null }
})
