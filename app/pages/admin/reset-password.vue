<script setup lang="ts">
const supabase = useSupabase()
const checking = ref(true)
const hasRecoverySession = ref(false)
const errorMessage = ref<string | null>(null)
const loading = ref(false)

const fields = [
  { name: 'password', type: 'password' as const, label: 'New password', required: true },
  { name: 'confirmPassword', type: 'password' as const, label: 'Confirm new password', required: true }
]

let unsubscribe: (() => void) | undefined

onMounted(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) hasRecoverySession.value = true
    checking.value = false
  })
  unsubscribe = () => subscription.unsubscribe()

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) hasRecoverySession.value = true
    checking.value = false
  })
})

onUnmounted(() => unsubscribe?.())

async function onSubmit(payload: { data: { password: string, confirmPassword: string } }) {
  errorMessage.value = null

  if (payload.data.password !== payload.data.confirmPassword) {
    errorMessage.value = 'Passwords do not match.'
    return
  }

  loading.value = true

  try {
    const { error } = await supabase.auth.updateUser({ password: payload.data.password })

    if (error) {
      errorMessage.value = error.message
      return
    }

    const profile = await getAuthenticatedProfile(supabase)
    if (!profile) {
      errorMessage.value = 'Something went wrong. Please try again.'
      return
    }

    await navigateTo('/admin')
  } catch {
    errorMessage.value = 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <UAuthForm
      v-if="!checking && hasRecoverySession"
      title="Set a new password"
      :fields="fields"
      :loading="loading"
      :submit="{ label: 'Reset password' }"
      @submit="onSubmit"
    >
      <template v-if="errorMessage" #validation>
        <UAlert color="error" variant="subtle" :title="errorMessage" />
      </template>
    </UAuthForm>
    <div v-else-if="!checking" class="max-w-sm text-center">
      <h1 class="text-lg font-semibold">
        This link is invalid or expired
      </h1>
      <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Request a new password reset link and try again.
      </p>
      <NuxtLink to="/admin/forgot-password" class="mt-4 inline-block text-sm underline">
        Request a new link
      </NuxtLink>
    </div>
  </div>
</template>
