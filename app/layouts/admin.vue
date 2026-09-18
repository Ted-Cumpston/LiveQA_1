<script setup lang="ts">
import type { AuthenticatedProfile } from '~/composables/useAuthSession'

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

async function logout() {
  await supabase.auth.signOut()
  await navigateTo('/admin/login')
}
</script>

<template>
  <div class="min-h-screen">
    <header class="flex flex-wrap items-center gap-4 border-b border-gray-200 p-4 dark:border-gray-800">
      <NuxtLink to="/admin" class="font-semibold">
        LiveQA Admin
      </NuxtLink>
      <nav class="flex flex-wrap gap-4 text-sm">
        <NuxtLink to="/admin/events">
          Events
        </NuxtLink>
        <template v-if="profile?.role === 'administrator'">
          <NuxtLink to="/admin/events/new">
            Create Event
          </NuxtLink>
          <NuxtLink to="/admin/events/restore">
            Restore from Backup
          </NuxtLink>
          <NuxtLink to="/admin/event-managers">
            Event Managers
          </NuxtLink>
          <NuxtLink to="/admin/templates">
            Templates
          </NuxtLink>
          <NuxtLink to="/admin/blocked-terms">
            Blocked Terms
          </NuxtLink>
          <NuxtLink to="/admin/audit-log">
            Audit Log
          </NuxtLink>
          <NuxtLink to="/admin/usage">
            Usage & Guardrails
          </NuxtLink>
        </template>
      </nav>
      <div class="ml-auto flex items-center gap-3">
        <span v-if="profile" class="text-sm text-gray-500 dark:text-gray-400">
          {{ profile.email }} ({{ roleLabel }})
        </span>
        <UButton label="Log out" @click="logout" />
      </div>
    </header>
    <main>
      <slot />
    </main>
  </div>
</template>
