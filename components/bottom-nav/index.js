Component({
  properties: {
    active: {
      type: String,
      value: "home"
    }
  },

  methods: {
    goHome() {
      if (this.data.active !== "home") {
        wx.reLaunch({ url: "/pages/home/home" });
      }
    },

    goAdd() {
      wx.navigateTo({ url: "/pages/add/add" });
    },

    goLibrary() {
      if (this.data.active !== "library") {
        wx.reLaunch({ url: "/pages/library/library" });
      }
    }
  }
});
