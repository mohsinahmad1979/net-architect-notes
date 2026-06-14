<template>
  <ThemeLayout />
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vitepress'
import Theme from 'vitepress/theme'

const ThemeLayout = Theme.Layout
const route = useRoute()

onMounted(() => {
  const content = document.querySelector('.VPContent') || document.querySelector('main')
  if (!content || document.querySelector('.download-md-link')) return

  const path = route.path.replace(/\/$/, '')
  if (!path) return

  const wrapper = document.createElement('div')
  wrapper.className = 'download-md-link'

  const link = document.createElement('a')
  link.href = `${path}.md`
  link.download = ''
  link.textContent = 'Download this page as Markdown'

  wrapper.appendChild(link)
  content.prepend(wrapper)
})
</script>

<style>
.download-md-link {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--vp-c-border-emphasis);
  border-radius: 0.5rem;
  background: var(--vp-c-bg-muted);
}
.download-md-link a {
  color: var(--vp-c-brand);
  text-decoration: none;
  font-weight: 600;
}
</style>