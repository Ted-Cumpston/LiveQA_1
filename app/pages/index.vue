<script setup lang="ts">
const ctaHref = ref('/admin/login')

onMounted(async () => {
  const profile = await getAuthenticatedProfile(useSupabase())
  if (profile?.role === 'administrator') {
    ctaHref.value = '/admin'
  }
})
</script>

<template>
  <div class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gray-950 px-6 text-center text-white">
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div class="absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-blue-600/40 blur-3xl" />
      <div class="absolute -right-20 top-0 h-112 w-md rounded-full bg-sky-300/20 blur-3xl" />
    </div>
    <div class="relative z-10 max-w-2xl">
      <h1 class="text-4xl font-semibold sm:text-5xl">
        <span class="italic">Live</span> Q&amp;A, simplified
      </h1>
      <p class="mx-auto mt-4 max-w-md text-sm text-gray-300 sm:text-base">
        Scan, ask, and vote from any phone. Moderators triage in real time -
        no app to install.
      </p>
      <UButton
        :to="ctaHref"
        size="lg"
        label="Get started"
        class="mt-8 rounded-full bg-white px-8 py-3 text-gray-900 hover:bg-gray-100"
      />
    </div>
  </div>
</template>
