<template>
  <div class="app-layout">
    <nav class="sidebar">
      <div class="logo">无双Bot</div>
      <router-link to="/dashboard" class="nav-item">监控面板</router-link>
      <router-link to="/chat-summary" class="nav-item">群聊总结</router-link>
      <router-link to="/settings" class="nav-item">参数设置</router-link>
    </nav>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.sidebar {
  width: 200px;
  background: var(--bg-sidebar);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-light);
}
.logo {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  padding: 0 20px 20px;
  border-bottom: 1px solid var(--border-light);
  margin-bottom: 8px;
  letter-spacing: -0.3px;
}
.nav-item {
  padding: 10px 20px;
  margin: 2px 8px;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  transition: all var(--transition);
}
.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.nav-item.router-link-active {
  background: var(--accent);
  color: #ffffff;
}
.content {
  flex: 1;
  padding: 28px 32px;
  overflow-y: auto;
  background: var(--bg-primary);
}
</style>
