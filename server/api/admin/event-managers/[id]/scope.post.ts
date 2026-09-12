import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyAdministrator } from '../../../../utils/verify-administrator'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'

interface SetScopeBody {
  scope?: 'global' | 'restricted'
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const SCOPE_INVALID_ERROR = "Scope must be 'global' or 'restricted'."
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventManagerId = getRouterParam(event, 'id') ?? ''

  const administratorId = await verifyAdministrator(event)
  if (!administratorId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<SetScopeBody>(event)
  const scope = body?.scope

  if (scope !== 'global' && scope !== 'restricted') {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: SCOPE_INVALID_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { error, data } = await supabase
    .from('profiles')
    .update({ em_scope: scope })
    .eq('id', eventManagerId)
    .select('id')

  if (error || !data?.length) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(administratorId, 'event_manager_scope_changed', null, { eventManagerId, scope })

  return { success: true, data: null, error: null }
})
