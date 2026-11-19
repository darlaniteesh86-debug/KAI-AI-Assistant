/* Agent module placeholder */
window.KAI_AGENT = { isAgentRequest: function (text) { return /agent mode|briefing/i.test(String(text || '')); }, run: async function () { return 'Agent layer loading.'; } };
