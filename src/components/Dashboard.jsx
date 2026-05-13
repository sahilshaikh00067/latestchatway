import React, { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

const Dashboard = () => {
  const [showFilter, setShowFilter] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("Today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [stats, setStats] = useState({ total: 0, success: 0, failed: 0, nonwa: 0, rejected: 0 });

  const COLORS = ["#F86C6B", "#4DBD74", "#20A8D8", "#f97316"];
  const filters = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "Custom Range"];

  useEffect(() => {
    const currentUser = JSON.parse(sessionStorage.getItem("user"));
    const reports = JSON.parse(localStorage.getItem("wappReports")) || [];
    const userReports = reports.filter((r) => r.userId === currentUser?.username);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start, end;

    if (selectedFilter === "Today") { start = today.getTime(); end = now.getTime(); }
    else if (selectedFilter === "Yesterday") { const y = new Date(today); y.setDate(y.getDate() - 1); start = y.getTime(); end = today.getTime() - 1; }
    else if (selectedFilter === "Last 7 Days") { const d = new Date(today); d.setDate(d.getDate() - 7); start = d.getTime(); end = now.getTime(); }
    else if (selectedFilter === "Last 30 Days") { const d = new Date(today); d.setDate(d.getDate() - 30); start = d.getTime(); end = now.getTime(); }
    else if (selectedFilter === "Custom Range") {
      if (!fromDate || !toDate) { start = 0; end = now.getTime(); }
      else { start = new Date(fromDate).getTime(); end = new Date(toDate).getTime() + 86399999; }
    }

    const filtered = userReports.filter((r) => r.rawDate >= start && r.rawDate <= end);

    let total = 0, success = 0, failed = 0, nonwa = 0, rejected = 0;
    filtered.forEach((r) => {
      total    += r.total    || 0;
      success  += r.valid    || 0;
      failed   += r.failed   || 0;
      nonwa    += r.nonwa    || 0;
      rejected += r.rejected || 0;
    });

    setStats({ total, success, failed, nonwa, rejected });
  }, [selectedFilter, fromDate, toDate]);

  const pieData = [
    { name: "Failed",   value: stats.failed },
    { name: "Success",  value: stats.success },
    { name: "NonWA",    value: stats.nonwa },
    { name: "Rejected", value: stats.rejected },
  ];

  return (
    <div className="min-h-screen bg-[#f1f1f1]">
      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-6">

        {/* FILTER BAR */}
        <div className="bg-white border border-gray-300 rounded p-4 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-600">Filter:</span>
          {filters.map((f) => (
            <button key={f} onClick={() => setSelectedFilter(f)}
              className={`px-4 py-1.5 rounded text-sm ${selectedFilter === f ? "bg-[#20A8D8] text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}>
              {f}
            </button>
          ))}
          {selectedFilter === "Custom Range" && (
            <>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border px-2 py-1 rounded text-sm outline-none" />
              <span className="text-sm">to</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border px-2 py-1 rounded text-sm outline-none" />
            </>
          )}
        </div>

        {/* STATS CARDS */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: "Total",    value: stats.total,    color: "bg-[#20A8D8]" },
            { label: "Success",  value: stats.success,  color: "bg-[#4DBD74]" },
            { label: "Failed",   value: stats.failed,   color: "bg-[#F86C6B]" },
            { label: "NonWA",    value: stats.nonwa,    color: "bg-gray-500"   },
            { label: "Rejected", value: stats.rejected, color: "bg-orange-400" },
          ].map((s) => (
            <div key={s.label} className={`${s.color} text-white rounded-lg p-4 text-center shadow`}>
              <div className="text-3xl font-bold">{s.value}</div>
              <div className="text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* PIE + TABLE */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white border border-gray-300 rounded p-4">
            <h3 className="font-semibold text-gray-700 mb-3">📊 Campaign Stats</h3>
            <div className="flex justify-center">
              <PieChart width={380} height={340}>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={130} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </div>
          </div>

          <div className="bg-white border border-gray-300 rounded p-4">
            <h3 className="font-semibold text-gray-700 mb-3">📋 Summary Table</h3>
            <table className="w-full border border-gray-200 text-sm">
              <thead>
                <tr className="bg-[#20A8D8] text-white">
                  <th className="p-3 text-left border-r border-blue-400">Status</th>
                  <th className="p-3 text-left border-r border-blue-400">Count</th>
                  <th className="p-3 text-left">Percentage</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Total",    value: stats.total,    color: "text-[#20A8D8]" },
                  { label: "Success",  value: stats.success,  color: "text-[#4DBD74]" },
                  { label: "Failed",   value: stats.failed,   color: "text-[#F86C6B]" },
                  { label: "NonWA",    value: stats.nonwa,    color: "text-gray-500"   },
                  { label: "Rejected", value: stats.rejected, color: "text-orange-400" },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className={`p-3 border-r border-gray-200 font-medium ${row.color}`}>{row.label}</td>
                    <td className="p-3 border-r border-gray-200">{row.value}</td>
                    <td className="p-3">{stats.total > 0 ? ((row.value / stats.total) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;