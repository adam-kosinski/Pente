import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/play'
    },
    {
      path: '/play',
      name: 'play',
      component: () => import('@/views/PlayView.vue')
    },
    {
      path: '/analyze',
      name: 'analyze',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('@/views/AnalyzeView.vue')
    }
  ]
})

export default router
