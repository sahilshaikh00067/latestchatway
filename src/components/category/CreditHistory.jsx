import React, { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

const API = "http://127.0.0.1:8000/api";

const CreditHistory = () => {
  const loggedUser = JSON.parse(sessionStorage.getItem("user"));

  const [logs,        setLogs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filterType,  setFilterType]  = useState("All");
  const [search,      setSearch]      = useState("");
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [dateFilter,  setDateFilter]  = useState("All Time");
  const [fromDate,    setFromDate]    = useState("");
  const [toDate,      setToDate]      = useState("");

  const dateFilters = [
    "All Time",
    "Today",
    "Yesterday",
    "Last 7 Days",
    "Last 30 Days",
    "This Month",
    "Custom Range",
  ];

  // ── Fetch from backend ──────────────────────────
  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res  = await fetch(`${API}/credit-history/?user_id=${loggedUser.id}`);
        const data = await res.json();
        if (data.status === "success") setLogs(data.logs);
      } catch (err) {
        console.error("Credit history fetch error:", err);
      }
      setLoading(false);
    };
    fetchLogs();
  }, []);

  // ── Date range filter ───────────────────────────
  const getDateRange = () => {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (dateFilter === "All Time")   return { start: 0, end: Infinity };
    if (dateFilter === "Today")      return { start: today.getTime(), end: Infinity };
    if (dateFilter === "Yesterday") {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { start: y.getTime(), end: today.getTime() - 1 };
    }
    if (dateFilter === "Last 7 Days") {
      const d = new Date(today); d.setDate(d.getDate() - 7);
      return { start: d.getTime(), end: Infinity };
    }
    if (dateFilter === "Last 30 Days") {
      const d = new Date(today); d.setDate(d.getDate() - 30);
      return { start: d.getTime(), end: Infinity };
    }
    if (dateFilter === "This Month") {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: d.getTime(), end: Infinity };
    }
    if (dateFilter === "Custom Range" && fromDate && toDate) {
      return {
        start: new Date(fromDate).getTime(),
        end:   new Date(toDate).getTime() + 86399999,
      };
    }
    return { start: 0, end: Infinity };
  };

  // ── Filter logic ────────────────────────────────
  const { start, end } = getDateRange();

  const filteredData = logs.filter((item) => {
    const matchType = filterType === "All"
      ? true
      : item.action === filterType.toLowerCase();

    const matchSearch =
      item.from_user?.toLowerCase().includes(search.toLowerCase()) ||
      item.to_user?.toLowerCase().includes(search.toLowerCase());

    // Parse date from "DD-MM-YYYY HH:MM"
    const parts    = item.date?.split(" ")[0]?.split("-");
    const itemTime = parts
      ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime()
      : 0;
    const matchDate = itemTime >= start && itemTime <= end;

    return matchType && matchSearch && matchDate;
  });

  // ── Totals ──────────────────────────────────────
  const totalCredit = filteredData
    .filter((l) => l.action === "credit")
    .reduce((s, l) => s + l.amount, 0);

  const totalDebit = filteredData
    .filter((l) => l.action === "debit")
    .reduce((s, l) => s + l.amount, 0);

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday) on working days.
        </marquee>
      </div>

      <div className="p-4">
        <div className="bg-white border border-gray-300 rounded">

          {/* HEADER */}
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-[18px] text-gray-800">Credit Audit</h2>

            {/* DATE FILTER */}
            <div className="relative">
              <div
                onClick={() => setFilterOpen(!filterOpen)}
                className="flex items-center gap-2 bg-[#4DBD74] text-white px-4 py-2 rounded cursor-pointer select-none"
              >
                <Calendar size={16} />
                {dateFilter}
              </div>

              {filterOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-300 rounded shadow z-50">
                  {dateFilters.map((f) => (
                    <div
                      key={f}
                      onClick={() => { setDateFilter(f); setFilterOpen(false); }}
                      className={`px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm
                        ${dateFilter === f ? "bg-gray-100 font-medium" : ""}`}
                    >
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-4">

            {/* SUMMARY CARDS */}


            {/* Custom Range inputs */}
            {dateFilter === "Custom Range" && (
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="input w-[180px]"
                />
                <span className="text-sm text-gray-500">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="input w-[180px]"
                />
              </div>
            )}

            {/* FILTER ROW */}
            <div className="flex flex-wrap gap-3 items-center mb-4">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="input w-[160px]"
              >
                <option>All</option>
                <option>Credit</option>
                <option>Debit</option>
              </select>

              <input
                placeholder="Search username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input w-[200px]"
              />
            </div>

            {/* TABLE */}
            <div className="border border-gray-300 overflow-x-auto">
              <table className="w-full text-sm border-collapse text-center">

                <thead className="bg-[#2FA4C7] text-white">
                  <tr>
                    {["Sr", "Type", "Amount", "From User", "To User", "Description", "Date"].map((h) => (
                      <th key={h} className="p-3 border-r border-blue-400 last:border-0 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-gray-400">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-gray-400">
                        No data available
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item, index) => (
                      <tr key={item.id} className="border-t bg-gray-50 hover:bg-gray-100">

                        <td className="p-3 border-r border-gray-200">{index + 1}</td>

                        {/* TYPE BADGE */}
                        <td className="border-r border-gray-200">
                          <span className={`px-3 py-1 rounded-full text-xs text-white
                            ${item.action === "credit" ? "bg-[#4DBD74]" : "bg-[#F86C6B]"}`}>
                            {item.action === "credit" ? "Credit" : "Debit"}
                          </span>
                        </td>

                        {/* AMOUNT */}
                        <td className={`border-r border-gray-200 font-bold
                          ${item.action === "credit" ? "text-green-600" : "text-red-500"}`}>
                          {item.action === "credit" ? "+" : "−"}{item.amount}
                        </td>

                        <td className="border-r border-gray-200">{item.from_user}</td>
                        <td className="border-r border-gray-200">{item.to_user}</td>

                        <td className="border-r border-gray-200 text-xs text-gray-500 max-w-[200px]">
                          <div className="truncate px-2">{item.description || "-"}</div>
                        </td>

                        <td className="text-xs text-gray-500 whitespace-nowrap">
                          {item.date}
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>

              </table>
            </div>

            {/* FOOTER */}
            <div className="flex justify-between mt-4 text-sm text-gray-500">
              <span>Showing {filteredData.length} of {logs.length} entries</span>
            </div>

          </div>
        </div>
      </div>

      <style>{`
        .input {
          padding: 8px;
          border: 1px solid #e5e7eb;
          background: white;
          outline: none;
          border-radius: 3px;
        }
        .input:focus {
          border: 1px solid #22d3ee;
          box-shadow: 0 0 0 1px #22d3ee;
        }
      `}</style>

    </div>
  );
};

export default CreditHistory;