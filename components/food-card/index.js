Component({
  properties: {
    food: {
      type: Object,
      value: {}
    },
    compact: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    openDetail() {
      this.triggerEvent("select", { id: this.data.food.id });
    }
  }
});
