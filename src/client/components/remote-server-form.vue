<template>
  <div>
    <div class="form-row">
      <label><i class="fa fa-tag"></i> {{ $i18n("configs.name") }}</label>
      <NodeRedInput
        v-model:value="node.name"
        :error="errors['node.name']"
        placeholder="name"
      />
    </div>
    <div class="form-row">
      <label><i class="fa fa-tag"></i> {{ $i18n("configs.host") }}</label>
      <NodeRedInput
        v-model:value="node.host"
        :error="errors['node.host']"
        placeholder="hostname"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "NodeRedNodeForm",
  props: {
    node: {
      type: Object,
      required: true,
    },
    errors: {
      type: Object,
      default: () => ({}),
    },
  },
  methods: {
    test() {
      console.log(this.$i18n("configs.host"));
    },
  },
});
</script>
