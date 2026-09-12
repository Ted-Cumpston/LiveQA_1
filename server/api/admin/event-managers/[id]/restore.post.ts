import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../../../utils/verify-administrator'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventManagerId = getRouterParam(event, 'id') ?? ''

  const administratorId = await verifyAdministrator(event)
  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { error, data } = await supabase
    .from('profiles')
    .update({ deleted_at: null })
    .eq('id', eventManagerId)
    .select('id')

  if (error || !data?.length) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(administratorId, 'event_manager_restored', null, { eventManagerId })

  return { success: true, data: null, error: null }
})
