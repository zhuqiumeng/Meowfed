const store = require("../../utils/store");

Page({
  data: {
    foods: [],
    trialFoods: [],
    recentFoods: [],
    stats: {
      total: 0,
      repurchase: 0,
      trial: 0,
      avoid: 0
    },
    insight: ""
  },

  onShow() {
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  refresh() {
    const foods = store.listFoods();
    const trialFoods = foods
      .filter((food) => food.status.key === "trial" || food.status.key === "observe")
      .slice(0, 4);
    const recentFoods = foods.slice(0, 4);
    const stats = {
      total: foods.length,
      repurchase: foods.filter((food) => food.status.key === "repurchase").length,
      trial: foods.filter((food) => food.status.key === "trial").length,
      avoid: foods.filter((food) => food.status.key === "avoid").length
    };

    const strongest = foods
      .filter((food) => food.positiveCount > 0)
      .sort((a, b) => b.positiveCount - a.positiveCount)[0];
    const insight = strongest
      ? `目前最稳的是「${strongest.flavor}」方向，已经有 ${strongest.positiveCount} 次好反馈`
      : "多试几款后，我会帮你找到肉源和质地偏好";

    this.setData({ foods, trialFoods, recentFoods, stats, insight });
  },

  addFood() {
    wx.navigateTo({ url: "/pages/add/add" });
  },

  openLibrary() {
    wx.reLaunch({ url: "/pages/library/library" });
  },

  openFood(event) {
    const id = (event.detail && event.detail.id) || event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  loadDemo() {
    store.resetDemo();
    this.refresh();
    wx.showToast({ title: "示例已经准备好", icon: "none" });
  },

  recordFirstTrial() {
    const food = this.data.trialFoods[0];
    if (!food) {
      this.addFood();
      return;
    }
    wx.navigateTo({ url: `/pages/feedback/feedback?id=${food.id}` });
  }
});
