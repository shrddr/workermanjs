<script>
</script>

<template>
  <div class="q">
    Q: <slot name="q"></slot>
  </div>
  <div>
    A: <slot></slot>
  </div>
</template>

<style scoped>
.q {
  padding-top: 0.5em;
}
</style>
