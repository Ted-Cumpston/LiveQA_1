import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../../../utils/verify-administrator'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'

interface AddAssignmentBody {
  eventId?: string
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const EVENT_ID_REQUIRED_ERROR = 'An event is required.'
const DUPLICATE_ERROR = 'This Event Manager is already assigned to that event.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventManagerId = getRouterParam(event, 'id') ?? ''

  const administratorId = await verifyAdministrator(event)
  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<AddAssignmentBody>(event)
  const eventId = body?.eventId ?? ''

  if (!eventId) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: EVENT_ID_REQUIRED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { error } = await supabase
    .from('event_manager_assignments')
    .insert({
      event_manager_id: eventManagerId,
      event_id: eventId,
      granted_by: administratorId
    })

  if (error) {
    setResponseStatus(event, error.code === '23505' ? 409 : 500)
    return { success: false, data: null, error: error.code === '23505' ? DUPLICATE_ERROR : GENERIC_ERROR }
  }

  await logAuditAction(administratorId, 'event_manager_assignment_added', eventId, { eventManagerId })

  return { success: true, data: null, error: null }
})
