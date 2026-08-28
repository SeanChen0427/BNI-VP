(function exposeVoteResultImage(root, factory) {
  const domain = typeof module !== "undefined" && module.exports
    ? require("../../core/case-domain.js")
    : root.FulianCaseDomain;
  const api = factory(domain);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FulianVoteResultImage = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createVoteResultImage(domain) {
  const TYPE_LABELS = Object.freeze({
    renewal: "續約",
    new: "新會員",
    industry: "轉換行業別",
  });

  function dateTimeLabel(value) {
    if (!value) return "未設定";
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "未設定";
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function percent(value, total) {
    if (!total) return "0%";
    const number = value / total * 100;
    return `${Number.isInteger(number) ? number : number.toFixed(1)}%`;
  }

  function createReport({
    state = {},
    caseType = "renewal",
    applicant = "",
    profession = "",
    deadlineAt = "",
    approveLabel = "同意",
    rejectLabel = "不同意",
    baseFallback = 0,
    generatedAt = new Date(),
  } = {}) {
    const summary = domain.voteSummary(state, baseFallback);
    const decisionLabels = {
      waiting: "尚未達參與門檻",
      tie: "同票，尚未形成決議",
      pass: "會員委員會表決通過",
      reject: "會員委員會表決不通過",
    };
    return Object.freeze({
      title: `${TYPE_LABELS[caseType] || "案件"}投票結果`,
      applicant: String(applicant || "未填寫"),
      profession: String(profession || "未填寫"),
      deadlineLabel: dateTimeLabel(deadlineAt),
      generatedLabel: dateTimeLabel(generatedAt),
      approveLabel: String(approveLabel || "同意"),
      rejectLabel: String(rejectLabel || "不同意"),
      decisionLabel: decisionLabels[summary.status],
      ...summary,
      approvePercent: percent(summary.approve, summary.total),
      rejectPercent: percent(summary.reject, summary.total),
    });
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function fillRoundedRect(context, x, y, width, height, radius, color) {
    roundedRect(context, x, y, width, height, radius);
    context.fillStyle = color;
    context.fill();
  }

  function fittedText(context, text, maxWidth) {
    const value = String(text || "");
    if (context.measureText(value).width <= maxWidth) return value;
    let result = value;
    while (result.length && context.measureText(`${result}…`).width > maxWidth) {
      result = result.slice(0, -1);
    }
    return `${result}…`;
  }

  function drawLegend(context, { color, label, count, percentage, y }) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(930, y, 14, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#342f2a";
    context.font = '700 30px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillText(fittedText(context, label, 360), 965, y + 10);
    context.textAlign = "right";
    context.font = '800 38px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillText(`${count} 票`, 1430, y + 7);
    context.font = '600 24px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillStyle = "#776f67";
    context.fillText(percentage, 1430, y + 40);
    context.textAlign = "left";
  }

  function drawStat(context, x, y, label, value) {
    fillRoundedRect(context, x, y, 238, 122, 18, "#f7f4ef");
    context.fillStyle = "#776f67";
    context.font = '600 23px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillText(label, x + 24, y + 38);
    context.fillStyle = "#342f2a";
    context.font = '800 44px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillText(String(value), x + 24, y + 93);
  }

  function renderCanvas(report, documentApi = document) {
    const canvas = documentApi.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1000;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("目前瀏覽器無法產生投票結果圖");

    context.fillStyle = "#f3efe8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#941b22";
    context.fillRect(0, 0, canvas.width, 176);
    context.fillStyle = "#f3c27a";
    context.fillRect(0, 170, canvas.width, 6);

    context.fillStyle = "#fff";
    context.font = '700 25px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillText("BNI 富聯分會｜會員委員會", 82, 54);
    context.font = '800 58px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillText(fittedText(context, report.title, 720), 80, 124);
    context.font = '600 28px "Noto Sans TC", "PingFang TC", sans-serif';
    context.textAlign = "right";
    context.fillText(fittedText(context, `申請者：${report.applicant}`, 620), 1518, 78);
    context.font = '500 24px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillText(fittedText(context, `專業別：${report.profession}`, 620), 1518, 122);
    context.textAlign = "left";

    fillRoundedRect(context, 64, 212, 1472, 690, 30, "#fff");
    context.save();
    context.shadowColor = "rgba(73, 48, 26, 0.10)";
    context.shadowBlur = 22;
    context.shadowOffsetY = 8;
    context.strokeStyle = "#e7ded3";
    context.lineWidth = 2;
    roundedRect(context, 64, 212, 1472, 690, 30);
    context.stroke();
    context.restore();

    const centerX = 450;
    const centerY = 520;
    const radius = 205;
    const lineWidth = 78;
    context.lineWidth = lineWidth;
    context.lineCap = "butt";
    context.beginPath();
    context.strokeStyle = "#e5e1dc";
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    if (report.total > 0) {
      const start = -Math.PI / 2;
      const approveEnd = start + Math.PI * 2 * report.approve / report.total;
      if (report.approve > 0) {
        context.beginPath();
        context.strokeStyle = "#3b6dcc";
        context.arc(centerX, centerY, radius, start, approveEnd);
        context.stroke();
      }
      if (report.reject > 0) {
        context.beginPath();
        context.strokeStyle = "#df4b2f";
        context.arc(centerX, centerY, radius, approveEnd, start + Math.PI * 2);
        context.stroke();
      }
    }

    context.textAlign = "center";
    context.fillStyle = "#342f2a";
    context.font = '800 80px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillText(String(report.total), centerX, centerY + 12);
    context.font = '600 25px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillStyle = "#776f67";
    context.fillText("已投票", centerX, centerY + 58);
    context.textAlign = "left";

    const statusColor = report.status === "pass"
      ? "#24734f"
      : report.status === "reject"
        ? "#a92c35"
        : "#8a5b18";
    const statusBackground = report.status === "pass"
      ? "#e5f3eb"
      : report.status === "reject"
        ? "#f7e7e8"
        : "#fff2dd";
    fillRoundedRect(context, 900, 270, 530, 72, 36, statusBackground);
    context.fillStyle = statusColor;
    context.font = '800 29px "Noto Sans TC", "PingFang TC", sans-serif';
    context.textAlign = "center";
    context.fillText(fittedText(context, report.decisionLabel, 470), 1165, 316);
    context.textAlign = "left";

    drawLegend(context, {
      color: "#3b6dcc",
      label: report.approveLabel,
      count: report.approve,
      percentage: report.approvePercent,
      y: 420,
    });
    drawLegend(context, {
      color: "#df4b2f",
      label: report.rejectLabel,
      count: report.reject,
      percentage: report.rejectPercent,
      y: 525,
    });
    context.strokeStyle = "#ede7df";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(900, 585);
    context.lineTo(1430, 585);
    context.stroke();
    drawStat(context, 900, 624, "投票基數", `${report.base} 人`);
    drawStat(context, 1162, 624, "最低參與", `${report.quorum} 人`);
    drawStat(context, 900, 766, "尚未投票", `${report.unvoted} 人`);
    drawStat(context, 1162, 766, "圖面產生", report.generatedLabel.slice(0, 10));

    context.fillStyle = "#776f67";
    context.font = '500 21px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillText(`投票截止：${report.deadlineLabel}`, 92, 946);
    context.textAlign = "right";
    context.fillText("本圖為票數統計；具名票向由副主席於系統內查閱。", 1508, 946);
    context.textAlign = "left";
    context.fillStyle = "#9a9188";
    context.font = '500 18px "Noto Sans TC", "PingFang TC", sans-serif';
    context.fillText("投票結果仍依董事顧問最終確認及系統正式紀錄為準", 92, 978);
    return canvas;
  }

  function filenameFor(report) {
    const safe = value => String(value || "").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-|-$/g, "");
    return `${safe(report.title)}-${safe(report.applicant)}-${String(report.generatedLabel).replace(/\D/g, "").slice(0, 8)}.png`;
  }

  async function download(report, { documentApi = document } = {}) {
    const canvas = renderCanvas(report, documentApi);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("投票結果圖產生失敗")), "image/png");
    });
    const url = URL.createObjectURL(blob);
    const anchor = documentApi.createElement("a");
    anchor.href = url;
    anchor.download = filenameFor(report);
    documentApi.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return anchor.download;
  }

  return Object.freeze({ createReport, renderCanvas, filenameFor, download });
});
