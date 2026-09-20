<script setup lang="ts">
const supabase = useSupabase()
const errorMessage = ref<string | null>(null)
const submitted = ref(false)
const loading = ref(false)

const fields = [
  { name: 'email', type: 'email' as const, label: 'Email', required: true }
]

async function onSubmit(payload: { data: { email: string } }) {
  errorMessage.value = null
  loading.value = true

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(payload.data.email, {
      redirectTo: `${window.location.origin}/admin/reset-password`
    })

    if (error) {
      errorMessage.value = 'Something went wrong. Please try again.'
      return
    }

    submitted.value = true
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
      v-if="!submitted"
      title="Reset password"
      description="Enter your email and we'll send you a link to reset your password."
      :fields="fields"
      :loading="loading"
      :submit="{ label: 'Send reset link' }"
      @submit="onSubmit"
    >
      <template v-if="errorMessage" #validation>
        <UAlert color="error" variant="subtle" :title="errorMessage" />
      </template>
      <template #footer>
        <NuxtLink to="/admin/login" class="text-sm underline">
          Back to log in
        </NuxtLink>
      </template>
    </UAuthForm>
    <div v-else class="max-w-sm text-center">
      <h1 class="text-lg font-semibold">
        Check your email
      </h1>
      <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
        If an account exists for that email, we've sent a link to reset your
        password.
      </p>
      <NuxtLink to="/admin/login" class="mt-4 inline-block text-sm underline">
        Back to log in
      </NuxtLink>
    </div>
  </div>
</template>
