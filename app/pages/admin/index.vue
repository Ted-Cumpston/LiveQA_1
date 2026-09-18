<script setup lang="ts">
import type { AuthenticatedProfile } from '~/composables/useAuthSession'

definePageMeta({ middleware: 'admin', layout: 'admin' })

const supabase = useSupabase()
const profile = ref<AuthenticatedProfile | null>(null)

const roleLabel = computed(() => {
  if (!profile.value) return ''
  if (profile.value.role === 'administrator') return 'Administrator'
  return profile.value.emScope === 'global' ? 'Event Manager (Global)' : 'Event Manager (Restricted)'
})

onMounted(async () => {
  profile.value = await getAuthenticatedProfile(supabase)
})

</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-4">
    <p>Logged in as {{ profile?.email }} ({{ roleLabel }})</p>
  </div>
</template>
