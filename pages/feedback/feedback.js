const store = require("../../utils/store");
const { OUTCOMES } = require("../../utils/rules");

const OUTCOME_ICONS = {
  eager: "/assets/icons/phosphor-heart.png",
  okay: "/assets/icons/phosphor-can.png",
  reluctant: "/assets/icons/phosphor-package.png",
  bury: "/assets/icons/phosphor-prohibit.png",
  unknown: "/assets/icons/phosphor-eyes.png"
};

Page({
  data: {
    food: null,
    outcomes: Object.values(OUTCOMES).map((outcome) => ({
      ...outcome,
      iconPath: OUTCOME_ICONS[outcome.key]
    })),
    selected: "",
    assistedBy: "",
    assistedOptions: ["饿了才吃", "加冻干才吃", "拌着才吃"],
    note: "",
    submitting: false
  },

  onLoad(options) {
    this.foodId = options.id;
    this.refresh();
  },

  refresh() {
    const food = store.getFood(this.foodId);
    if (!food) {
      wx.showToast({ title: "这款罐头不见了", icon: "none" });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.setData({ food });
  },

  goBack() {
    wx.navigateBack();
  },

  selectOutcome(event) {
    const selected = event.currentTarget.dataset.key;
    this.setData({
      selected,
      assistedBy: selected === "reluctant" ? this.data.assistedBy : ""
    });
  },

  selectAssist(event) {
    const value = event.currentTarget.dataset.value;
    this.setData({ assistedBy: this.data.assistedBy === value ? "" : value });
  },

  updateNote(event) {
    this.setData({ note: event.detail.value });
  },

  submit() {
    if (!this.data.selected || this.data.submitting) {
      if (!this.data.selected) {
        wx.showToast({ title: "先选一个最像的表现", icon: "none" });
      }
      return;
    }

    this.setData({ submitting: true });
    const updated = store.addResult(this.foodId, this.data.selected, {
      assistedBy: this.data.assistedBy,
      note: this.data.note.trim()
    });

    const message =
      updated.status.key === "repurchase"
        ? "正式进入长期回购！"
        : updated.status.key === "avoid"
          ? "已加入埋屎避雷"
          : "这次表现记住了";

    wx.showToast({ title: message, icon: "none", duration: 1200 });
    setTimeout(() => {
      wx.redirectTo({ url: `/pages/detail/detail?id=${this.foodId}` });
    }, 850);
  }
});
