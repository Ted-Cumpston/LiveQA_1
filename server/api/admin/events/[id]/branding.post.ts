import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { verifyEventAccess } from '../../../../utils/verify-event-access'
import { useSupabaseServiceRole } from '../../../../utils/supabase'
import { logAuditAction } from '../../../../utils/log-audit-action'
import { isValidHexColor } from '../../../../../app/utils/color'

interface SaveBrandingBody {
  accentColor?: string
  backgroundColor?: string
  welcomeText?: string
  themeMode?: 'light' | 'dark' | 'system'
}

const NOT_AUTHORIZED_ERROR = 'Not authorized.'
const HEX_COLOR_ERROR = 'Enter a hex color like #2563EB, or leave blank.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'id') ?? ''

  const callerId = await verifyEventAccess(event, eventId)
  if (!callerId) {
    setResponseStatus(event, 401)
    return { success: false, data: null, error: NOT_AUTHORIZED_ERROR }
  }

  const body = await readBody<SaveBrandingBody>(event)

  const trimmedAccentColor = (body?.accentColor ?? '').trim()
  if (trimmedAccentColor && !isValidHexColor(trimmedAccentColor)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: HEX_COLOR_ERROR }
  }

  const trimmedBackgroundColor = (body?.backgroundColor ?? '').trim()
  if (trimmedBackgroundColor && !isValidHexColor(trimmedBackgroundColor)) {
    setResponseStatus(event, 400)
    return { success: false, data: null, error: HEX_COLOR_ERROR }
  }

  const supabase = useSupabaseServiceRole()

  const { error, data } = await supabase
    .from('event_settings')
    .update({
      accent_color: trimmedAccentColor || null,
      background_color: trimmedBackgroundColor || null,
      welcome_text: (body?.welcomeText ?? '').trim() || null,
      theme_mode: body?.themeMode ?? 'system'
    })
    .eq('event_id', eventId)
    .select('event_id')

  if (error || !data?.length) {
    setResponseStatus(event, 500)
    return { success: false, data: null, error: GENERIC_ERROR }
  }

  await logAuditAction(callerId, 'event_branding_updated', eventId, {})

  return { success: true, data: null, error: null }
})
