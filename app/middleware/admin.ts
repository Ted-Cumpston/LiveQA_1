const PRE_AUTH_PATHS = ['/admin/login', '/admin/forgot-password', '/admin/reset-password']

export default defineNuxtRouteMiddleware(async (to) => {
  if (PRE_AUTH_PATHS.includes(to.path)) return

  const supabase = useSupabase()
  const profile = await getAuthenticatedProfile(supabase)

  if (!profile) return navigateTo('/admin/login')
})
