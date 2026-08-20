const store = require("../../utils/store");
const { OUTCOMES } = require("../../utils/rules");

const OUTCOME_ICONS = {
  eager: "/assets/icons/phosphor-heart.png",
  okay: "/assets/icons/phosphor-can.png",
  reluctant: "/assets/icons/phosphor-package.png",
  bury: "/assets/icons/phosphor-prohibit.png",
  unknown: "/assets/icons/phosphor-eyes.png"
};

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const monthValue = date.getMonth() + 1;
  const dayValue = date.getDate();
  const month = monthValue < 10 ? `0${monthValue}` : `${monthValue}`;
  const day = dayValue < 10 ? `0${dayValue}` : `${dayValue}`;
  return `${month}.${day}`;
}

Page({
  data: {
    food: null,
    progressDots: [0, 1, 2],
    history: []
  },

  onLoad(options) {
    this.foodId = options.id;
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const food = store.getFood(this.foodId);
    if (!food) {
      wx.showToast({ title: "这款罐头不见了", icon: "none" });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }

    const history = (food.results || [])
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((result) => ({
        ...result,
        outcomeInfo: OUTCOMES[result.outcome],
        iconPath: OUTCOME_ICONS[result.outcome],
        dateText: formatDate(result.createdAt)
      }));

    this.setData({ food, history });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.reLaunch({ url: "/pages/home/home" });
    }
  },

  record() {
    wx.navigateTo({ url: `/pages/feedback/feedback?id=${this.foodId}` });
  },

  edit() {
    wx.navigateTo({ url: `/pages/add/add?id=${this.foodId}` });
  },

  pauseBuying() {
    wx.showModal({
      title: "暂停回购这款？",
      content: "它会保留以前喜欢过的记录，之后仍可以重新观察。",
      confirmText: "暂停",
      confirmColor: "#6D6073",
      success: ({ confirm }) => {
        if (confirm) {
          store.setManualStatus(this.foodId, "paused");
          this.refresh();
        }
      }
    });
  },

  resumeTrial() {
    store.setManualStatus(this.foodId, null);
    wx.showToast({ title: "重新放回观察中", icon: "none" });
    this.refresh();
  },

  remove() {
    wx.showModal({
      title: "删除这款罐头？",
      content: "试吃历史也会一起删除，无法恢复。",
      confirmText: "删除",
      confirmColor: "#D7484F",
      success: ({ confirm }) => {
        if (confirm) {
          store.removeFood(this.foodId);
          wx.reLaunch({ url: "/pages/home/home" });
        }
      }
    });
  }
});
