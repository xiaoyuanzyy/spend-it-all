// pages/feedback/feedback.js
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    nickname: '',
    content: '',
    messages: [],
    submitting: false,
    statusBarHeight: 44
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight || 44 });
    this.loadMessages();
  },

  onShow() {
    this.loadMessages();
  },

  async loadMessages() {
    try {
      const res = await cloud.call('feedback', { action: 'list' });
      if (res && res.list) {
        this.setData({
          messages: res.list.map(m => ({
            ...m,
            timeDisplay: this.formatTime(m.createdAt)
          }))
        });
      }
    } catch (e) {
      console.warn('[feedback] 加载留言失败', e);
    }
  },

  formatTime(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  async onSubmit() {
    const content = this.data.content.trim();
    if (!content) {
      wx.showToast({ title: '请输入留言内容', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const res = await cloud.call('feedback', {
        action: 'submit',
        nickname: this.data.nickname.trim() || '匿名用户',
        content
      });
      if (res && res.ok) {
        wx.showToast({ title: '留言成功！', icon: 'success' });
        this.setData({ content: '', nickname: '' });
        this.loadMessages();
      } else {
        wx.showToast({ title: (res && res.error) || '留言失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[feedback] 提交失败:', JSON.stringify(e));
      const msg = (e && (e.errMsg || e.message)) || '提交失败，请重试';
      wx.showToast({ title: msg, icon: 'none', duration: 2500 });
    }
    this.setData({ submitting: false });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
