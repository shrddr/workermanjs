<template>
  <div v-show="show" @click.stop="this.$emit('update:show', false)" class="dialog">
    <div @click.stop class="dialog_content">
      <slot></slot>
    </div>
  </div>
</template>

<script>
export default {
  name: 'modalDialog',
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  methods: {

  }
}

</script>

<style scoped>
.dialog {
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  position: fixed;
  z-index: 10;
  display: flex;
}
.dialog_content {
  margin: auto;
  background: var(--color-background);
  border-radius: 3px;
  min-height: 50px;
  min-width: 300px;
  padding: 20px;
  overflow-y: auto;
  max-height: 100%;
}
</style>

