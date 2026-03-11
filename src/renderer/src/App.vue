<template>
  <div class="app-layout">
    <nav class="sidebar">
      <div class="logo">EchoBot</div>
      <router-link to="/dashboard" class="nav-item">监控面板</router-link>
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
  background: #1a1a2e;
  color: #e0e0e0;
}
.sidebar {
  width: 180px;
  background: #16213e;
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #0f3460;
}
.logo {
  font-size: 22px;
  font-weight: bold;
  color: #e94560;
  padding: 0 20px 20px;
  border-bottom: 1px solid #0f3460;
  margin-bottom: 10px;
}
.nav-item {
  padding: 12px 20px;
  color: #a0a0b0;
  text-decoration: none;
  transition: all 0.2s;
}
.nav-item:hover,
.nav-item.router-link-active {
  color: #fff;
  background: #0f3460;
}
.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
</style>
