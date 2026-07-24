import React, { useEffect, useState, useRef, useCallback } from "react";
import { Calendar } from "lucide-react";
import * as XLSX from "xlsx";

const BASE = "https://latestchatway.onrender.com/api";

// ─────────────────────────────────────────────
// 🔔 TOAST CONFIG
// ─────────────────────────────────────────────
const TOAST_STYLES = {
  error:   { icon: "✕", accent: "#F86C6B", bg: "linear-gradient(135deg, #fff5f5, #ffffff)", ring: "#F86C6B33" },
  warning: { icon: "⚠", accent: "#F0AD4E", bg: "linear-gradient(135deg, #fffaf0, #ffffff)", ring: "#F0AD4E33" },
  success: { icon: "✓", accent: "#4DBD74", bg: "linear-gradient(135deg, #f3fdf7, #ffffff)", ring: "#4DBD7433" },
  info:    { icon: "ℹ", accent: "#20A8D8", bg: "linear-gradient(135deg, #f0f9fd, #ffffff)", ring: "#20A8D833" },
};

const WappReports = () => {
  const currentUser = JSON.parse(sessionStorage.getItem("user") || "null");
  const role = currentUser?.role?.toLowerCase();
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("Today");
  const [allEntries, setAllEntries] = useState([]);
  const [entries, setEntries] = useState([]);
  const [openRow, setOpenRow] = useState(null);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const intervalRef = useRef(null);

  const filters = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "Custom Range"];

  // 🔔 Premium toast — replaces alert()
  const showToast = useCallback((message, type = "error") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const dismissToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // ─────────────────────────────────────────
  // FETCH FROM DB
  // ─────────────────────────────────────────
  const fetchCampaigns = async () => {
    if (!currentUser) return;

    setLoading(true);

    try {
      const res = await fetch(`${BASE}/my-campaigns/?user_id=${currentUser.id}`);
      const data = await res.json();

      if (data.status === "success") {
        setAllEntries(data.campaigns);
      }
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  };

  // Page load pe fetch karo
  useEffect(() => {
    fetchCampaigns();
  }, []);

  // ─────────────────────────────────────────
  // AUTO REFRESH — agar koi pending campaign hai
  // ─────────────────────────────────────────
  useEffect(() => {
    const hasPending = allEntries.some((e) => e.status === "pending");

    if (hasPending) {
      // Har 60 second mein check karo
      intervalRef.current = setInterval(() => {
        fetchCampaigns();
      }, 60 * 1000);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [allEntries]);

  // ─────────────────────────────────────────
  // FILTER LOGIC
  // ─────────────────────────────────────────
  useEffect(() => {
    const now = new Date();
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const todayIST = new Date(Math.floor((now.getTime() + IST_OFFSET) / 86400000) * 86400000 - IST_OFFSET);

    let start, end;

    if (selectedFilter === "Today") {
      start = todayIST.getTime();
      end = now.getTime();
    } else if (selectedFilter === "Yesterday") {
      start = todayIST.getTime() - 86400000;
      end = todayIST.getTime() - 1;
    } else if (selectedFilter === "Last 7 Days") {
      start = todayIST.getTime() - 7 * 86400000;
      end = now.getTime();
    } else if (selectedFilter === "Last 30 Days") {
      start = todayIST.getTime() - 30 * 86400000;
      end = now.getTime();
    } else if (selectedFilter === "This Month") {
      const istNow = new Date(now.getTime() + IST_OFFSET);
      start = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1) - IST_OFFSET).getTime();
      end = now.getTime();
    } else if (selectedFilter === "Last Month") {
      const istNow = new Date(now.getTime() + IST_OFFSET);
      start = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() - 1, 1) - IST_OFFSET).getTime();
      end = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1) - IST_OFFSET).getTime() - 1;
    } else if (selectedFilter === "Custom Range") {
      if (!customStart || !customEnd) { setEntries(allEntries); return; }
      start = new Date(customStart).getTime();
      end = new Date(customEnd).getTime() + 86399999;
    }

    setEntries(allEntries.filter((e) => e.rawDate >= start && e.rawDate <= end));
    setPage(1);
  }, [selectedFilter, allEntries, customStart, customEnd]);

  // ─────────────────────────────────────────
  // DOWNLOAD EXCEL
  // ─────────────────────────────────────────
  const handleDownload = (data) => {
    let rows = [];

    // Completed campaign
    if (data.numberResults && data.numberResults.length > 0) {
      // 🔥 Random shuffle — Success/Failed/NonWA/Rejected sab mix ho jayenge
      const shuffled = [...data.numberResults].sort(() => Math.random() - 0.5);

      rows = shuffled.map((r) => ({
        Number: r.number,
        Status: (r.status || "").toUpperCase(),
      }));
    }

    // Pending campaign - Admin only
    else if (role === "admin" && data.numberList && data.numberList.length > 0) {
      rows = data.numberList.map((num) => ({
        Number: num,
        Status: "PENDING",
      }));
    }

    // No data
    else {
      showToast("No number data available for this campaign", "warning");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 15 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Campaign Report");

    XLSX.writeFile(wb, `${data.name || "report"}.xlsx`);
    showToast(`"${data.name || "Report"}" downloaded successfully`, "success");
  };

  const toggleRow = (i) => setOpenRow(openRow === i ? null : i);
  const totalPages = Math.ceil(entries.length / perPage);
  const paginated = entries.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      {/* ── PREMIUM UI CSS ───────────────────────── */}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(60px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)     scale(1);   }
        }
        @keyframes toast-shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
        .wc-toast { animation: toast-in 0.32s cubic-bezier(0.34, 1.3, 0.64, 1) forwards; }
        .wc-toast-bar { animation: toast-shrink 3.8s linear forwards; }

        @keyframes row-expand {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .wr-expand-row { animation: row-expand 0.22s ease forwards; }

        .wr-body-row { transition: background-color 0.15s ease; }
        .wr-body-row:hover { background-color: #eef6fb !important; }

        .wr-toggle-btn {
          transition: transform 0.18s cubic-bezier(0.34,1.4,0.64,1), background-color 0.15s ease;
        }
        .wr-toggle-btn:hover { transform: scale(1.15); background-color: #3ea862 !important; }
        .wr-toggle-btn:active { transform: scale(0.92); }

        .wr-download-btn {
          transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
        }
        .wr-download-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px #20A8D855;
          background-color: #1b8db8;
        }
        .wr-download-btn:active:not(:disabled) { transform: translateY(0) scale(0.97); }

        .wr-refresh-btn {
          transition: transform 0.15s ease, background-color 0.15s ease;
        }
        .wr-refresh-btn:hover { background-color: #e2e8ee !important; }
        .wr-refresh-btn:active { transform: scale(0.96); }
        .wr-refresh-spin { animation: wr-spin 0.7s linear; }
        @keyframes wr-spin { to { transform: rotate(360deg); } }

        .wr-filter-pill {
          transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
        }
        .wr-filter-pill:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 14px #4DBD7455;
          background-color: #3ea862 !important;
        }

        @keyframes wr-dropdown-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)     scale(1);   }
        }
        .wr-dropdown { animation: wr-dropdown-in 0.16s ease forwards; transform-origin: top right; }
        .wr-dropdown-item { transition: background-color 0.12s ease, padding-left 0.12s ease; }
        .wr-dropdown-item:hover { padding-left: 20px; }

        .wr-stat-pill {
          transition: transform 0.15s ease;
          border-radius: 6px;
        }
        .wr-stat-pill:hover { transform: scale(1.05); }

        .wr-input {
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .wr-input:focus {
          border-color: #20A8D8 !important;
          box-shadow: 0 0 0 3px #20A8D822;
          outline: none;
        }

        .wr-page-btn {
          transition: transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
        }
        .wr-page-btn:hover:not(:disabled) {
          background-color: #20A8D8 !important;
          color: #fff !important;
          border-color: #20A8D8 !important;
          box-shadow: 0 3px 10px #20A8D844;
        }
        .wr-page-btn:active:not(:disabled) { transform: scale(0.96); }

        @keyframes wr-pulse-soft {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.55; }
        }
        .wr-pending-badge { animation: wr-pulse-soft 1.8s ease-in-out infinite; }

        @keyframes wr-loading-shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.9; }
          100% { opacity: 0.4; }
        }
        .wr-loading-dot { animation: wr-loading-shimmer 1.1s ease-in-out infinite; }
      `}</style>

      {/* ══════════════════════════════════════════ */}
      {/* 🔔 TOAST STACK                             */}
      {/* ══════════════════════════════════════════ */}
      <div className="fixed top-5 right-5 z-[70] flex flex-col gap-2.5 w-[320px] max-w-[90vw]">
        {toasts.map((t) => {
          const style = TOAST_STYLES[t.type] || TOAST_STYLES.error;
          return (
            <div
              key={t.id}
              className="wc-toast"
              style={{
                background: style.bg,
                border: `1px solid ${style.accent}33`,
                borderLeft: `4px solid ${style.accent}`,
                borderRadius: 12,
                boxShadow: `0 10px 30px rgba(0,0,0,0.12), 0 0 0 4px ${style.ring}`,
                padding: "12px 14px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: style.accent, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 800, flexShrink: 0, marginTop: 1,
              }}>{style.icon}</div>
              <div style={{ flex: 1, fontSize: 13, color: "#2b3948", lineHeight: 1.4, fontWeight: 500 }}>
                {t.message}
              </div>
              <button
                onClick={() => dismissToast(t.id)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "#9aa5b1", fontSize: 15, lineHeight: 1, padding: 0, flexShrink: 0,
                }}
              >✕</button>
              <div style={{
                position: "absolute", bottom: 0, left: 0, height: 3,
                background: style.accent, opacity: 0.55,
              }} className="wc-toast-bar" />
            </div>
          );
        })}
      </div>

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 font-normal text-[18px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday) on working days.
        </marquee>
      </div>

      <div className="p-4">
        <div className="bg-white border border-gray-300 rounded">

          {/* HEADER */}
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-[18px] text-gray-800">Whatsapp Report</h2>
              {/* 🔥 Manual refresh button */}
              <button
                onClick={fetchCampaigns}
                className="wr-refresh-btn bg-gray-100 border border-gray-300 text-gray-600 px-3 py-1 rounded text-sm flex items-center gap-1"
              >
                <span className={loading ? "wr-refresh-spin inline-block" : "inline-block"}>🔄</span> Refresh
              </button>
              {allEntries.some((e) => e.status === "pending") && (
                <span className="wr-pending-badge bg-orange-100 text-orange-600 border border-orange-300 px-3 py-1 rounded text-xs">
                  ⏳ Your Pending Campaign Auto-Refresh
                </span>
              )}
            </div>

            <div className="relative">
              <div
                onClick={() => setFilterOpen(!filterOpen)}
                className="wr-filter-pill flex items-center gap-2 bg-[#4DBD74] text-white px-4 py-2 rounded cursor-pointer"
              >
                <Calendar size={16} /> {selectedFilter}
              </div>
              {filterOpen && (
                <div className="wr-dropdown absolute right-0 mt-2 w-52 bg-white border border-gray-300 rounded shadow-lg z-50 overflow-hidden">
                  {filters.map((f, i) => (
                    <div key={i} onClick={() => { setSelectedFilter(f); setFilterOpen(false); setShowCustom(f === "Custom Range"); }}
                      className="wr-dropdown-item px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm">
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CUSTOM DATE */}
          {showCustom && (
            <div className="px-4 py-3 flex gap-3 items-center border-b bg-gray-50">
              <label className="text-sm">From:</label>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="wr-input border border-gray-300 px-2 py-1 rounded outline-none text-sm" />
              <label className="text-sm">To:</label>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="wr-input border border-gray-300 px-2 py-1 rounded outline-none text-sm" />
            </div>
          )}

          <div className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span>Show</span>
              <select className="wr-input border border-gray-300 px-2 py-1 rounded outline-none"
                value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>entries</span>
            </div>

            {/* TABLE */}
            <div className="border border-gray-300">
              <table className="w-full text-[15px] border-collapse text-center">
                <thead className="bg-[#20a8d8] text-white">
                  <tr>
                    <th className="px-2 py-2 border-r border-gray-300"></th>
                    <th className="px-3 py-2 border-r border-gray-300">Campname</th>
                    <th className="px-3 py-2 border-r border-gray-300">Number</th>
                    <th className="px-3 py-2 border-r border-gray-300">Message</th>
                    <th className="px-3 py-2 border-r border-gray-300">Status</th>
                    <th className="px-3 py-2 border-r border-gray-300">Submit Date</th>
                    <th className="px-3 py-2">Download</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="py-6 text-gray-500">
                        <span className="wr-loading-dot">⏳</span> Loading...
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-6 text-gray-600">No data available in table</td>
                    </tr>
                  ) : (
                    paginated.map((e, i) => (
                      <React.Fragment key={i}>
                        <tr className="wr-body-row border-t bg-gray-200">
                          <td className="border-r border-gray-300">
                            <button onClick={() => toggleRow(i)}
                              className="wr-toggle-btn bg-[#4dbd74] text-white w-5 h-6 rounded-full">
                              {openRow === i ? "-" : "+"}
                            </button>
                          </td>
                          <td className="px-3 py-2 border-r border-gray-300">{e.name}</td>
                          <td className="px-3 py-2 border-r border-gray-300">{e.total}</td>
                          <td className="px-3 py-2 border-r border-gray-300 max-w-[200px] truncate">{e.message}</td>

                          {/* 🔥 STATUS BADGE */}
                          <td className="px-3 py-2 border-r border-gray-300">
                            {e.status === "pending" ? (
                              <span className="wr-pending-badge bg-orange-400 text-white px-2 py-1 text-xs rounded-full">
                                ⏳ PENDING
                              </span>
                            ) : (
                              <span className="bg-[#4dbd74] text-white px-2 py-1 text-xs rounded-full">
                                COMPLETED
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2 border-r border-gray-300">{e.date}</td>
                          <td className="px-3 py-2">
                            {(e.status === "completed" || role === "admin") ? (
                              <button
                                onClick={() => handleDownload(e)}
                                className="wr-download-btn bg-[#20A8D8] text-white px-3 py-1 rounded-full text-xs"
                              >
                                Download
                              </button>
                            ) : (
                              <button
                                disabled
                                className="bg-gray-300 text-gray-600 px-3 py-1 rounded-full text-xs cursor-not-allowed"
                              >
                                Pending
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* EXPANDED ROW */}
                        {openRow === i && (
                          <tr className="wr-expand-row">
                            <td colSpan="7" className="bg-gray-100">
                              <div className="p-3 text-left">

                                {/* Files */}
                                {(e.file_urls || []).length > 0 && (
                                  <div className="mb-3">
                                    <b>Files:</b>
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                      {e.file_urls.map((url, fi) => (
                                        <a key={fi} href={url} target="_blank" rel="noreferrer"
                                          className="text-blue-500 text-xs underline hover:text-blue-700 transition-colors duration-150">
                                          File {fi + 1}
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Stats */}
                                <div className="flex gap-2 mt-2 flex-wrap justify-center">
                                  <span className="wr-stat-pill bg-[#20A8D8] text-white px-3 py-1">TOTAL {e.total || 0}</span>
                                  <span className="wr-stat-pill bg-[#F86C6B] text-white px-3 py-1">NONWA {e.nonwa || 0}</span>
                                  <span className="wr-stat-pill bg-gray-500 text-white px-3 py-1">FAILED {e.failed || 0}</span>
                                  <span className="wr-stat-pill bg-orange-400 text-white px-3 py-1">REJECTED {e.rejected || 0}</span>
                                  <span className="wr-stat-pill bg-[#4DBD74] text-white px-3 py-1">SUCCESS {e.success || 0}</span>
                                </div>

                                {/* Pending message */}
                                {e.status === "pending" && (
                                  <div className="mt-3 text-center text-orange-500 text-sm font-medium">
                                    ⏳Your Campaign Is Processing
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            <div className="flex justify-between mt-4 text-sm">
              <span>
                Showing {entries.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, entries.length)} of {entries.length} entries
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page === 1}
                  className="wr-page-btn border px-3 py-1 disabled:opacity-40">Previous</button>
                <button onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page === totalPages || totalPages === 0}
                  className="wr-page-btn border px-3 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WappReports;