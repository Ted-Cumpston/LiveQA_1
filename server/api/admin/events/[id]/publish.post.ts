import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../../../utils/verify-administrator'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const administratorId = await verifyAdministrator(event)
  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { error, data } = await supabase
    .from('events')
    .update({ status: 'live' })
    .eq('id', eventId)
    .select('id')

  if (error || !data?.length) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(administratorId, 'event_published', eventId, {})

  return { success: true, data: null, error: null }
})
