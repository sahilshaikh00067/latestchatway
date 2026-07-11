import React, { useEffect, useState, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

const BASE = "https://www.cloudwhatsapp.in/api";
const COLORS = ["#F86C6B", "#00E396", "#3B82F6", "#f97316"];
const filters = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "Custom Range"];

const Dashboard = () => {
  const [selectedFilter, setSelectedFilter] = useState("Today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [allCampaigns, setAllCampaigns] = useState([]);
  const [stats, setStats] = useState({ total: 0, success: 0, failed: 0, nonwa: 0, rejected: 0 });
  const intervalRef = useRef(null);

  // ─────────────────────────────────────────
  // FETCH FROM DB
  // ─────────────────────────────────────────
  const fetchCampaigns = async () => {
    const currentUser = JSON.parse(sessionStorage.getItem("user"));
    if (!currentUser) return;
    try {
      const res = await fetch(`${BASE}/my-campaigns/?user_id=${currentUser.id}`);
      const data = await res.json();
      if (data.status === "success") {
        setAllCampaigns(data.campaigns);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    }
  };

  useEffect(() => { fetchCampaigns(); }, []);

  // ─────────────────────────────────────────
  // AUTO REFRESH jab pending ho
  // ─────────────────────────────────────────
  useEffect(() => {
    const hasPending = allCampaigns.some((c) => c.status === "pending");
    clearInterval(intervalRef.current);
    if (hasPending) {
      intervalRef.current = setInterval(fetchCampaigns, 60 * 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [allCampaigns]);

  // ─────────────────────────────────────────
  // FILTER + STATS CALCULATE
  // ─────────────────────────────────────────
  useEffect(() => {
    const now = new Date();
    // IST offset = +5:30 = 330 minutes
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
    } else if (selectedFilter === "Custom Range") {
      if (!fromDate || !toDate) return;
      start = new Date(fromDate).getTime();
      end = new Date(toDate).getTime() + 86399999;
    }

    // 🔥 Sirf COMPLETED campaigns count karo stats mein
    const filtered = allCampaigns.filter(
      (c) => c.status === "completed" && c.rawDate >= start && c.rawDate <= end
    );

    let total = 0, success = 0, failed = 0, nonwa = 0, rejected = 0;
    filtered.forEach((c) => {
      total += c.total || 0;
      success += c.success || 0;
      failed += c.failed || 0;
      nonwa += c.nonwa || 0;
      rejected += c.rejected || 0;
    });

    setStats({ total, success, failed, nonwa, rejected });
  }, [selectedFilter, fromDate, toDate, allCampaigns]);

  const hasPending = allCampaigns.some((c) => c.status === "pending");

  const pieData = [
    { name: "Failed", value: stats.failed },
    { name: "Success", value: stats.success },
    { name: "NonWA", value: stats.nonwa },
    ];

  // Helper: readable label for the date-range pill
  const rangeLabel = () => {
    const opts = { month: "long", day: "numeric", year: "numeric" };
    if (selectedFilter === "Custom Range" && fromDate && toDate) {
      const f = new Date(fromDate).toLocaleDateString("en-US", opts);
      const t = new Date(toDate).toLocaleDateString("en-US", opts);
      return `${f} - ${t}`;
    }
    return selectedFilter;
  };

  const summaryRows = [
    {
      label: "Total",
      value: stats.total,
      color: "text-black",
    },
    {
      label: "NONWA",
      value: stats.nonwa,
      color: "text-black",
    },
    {
      label: "ACTIVEWA",
      value: stats.success,
      color: "text-black",
    },
  ];

  return (
    <div className="min-h-screen bg-[#eef1f5]">
      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-6">

        {/* 🔥 PENDING ALERT BANNER */}
        {hasPending && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-5 flex items-center justify-between shadow-sm transition-all">
            <div className="flex items-center gap-2 text-orange-600 text-sm font-medium">
              <span className="animate-pulse text-lg">⏳</span>
              Your Campaign is Pending Wait For Few Minutes.
            </div>
            <button onClick={fetchCampaigns}
              className="bg-orange-400 hover:bg-orange-500 text-white px-4 py-1.5 rounded-full text-sm font-medium transition-colors shadow-sm">
              🔄 Refresh
            </button>
          </div>
        )}

        {/* FILTER BAR */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-5 flex items-center gap-2 flex-wrap shadow-sm">
          <span className="text-sm font-semibold text-gray-500 mr-1">Filter</span>
          {filters.map((f) => (
            <button key={f} onClick={() => setSelectedFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${selectedFilter === f
                  ? "bg-[#0bc184] text-white shadow-sm"
                  : "bg-gray-50 hover:bg-gray-200 text-gray-600"
                }`}>
              {f}
            </button>
          ))}
          {selectedFilter === "Custom Range" && (
            <>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="border border-gray-200 px-3 py-1.5 rounded-full text-sm outline-none focus:ring-2 focus:ring-emerald-200 transition-all" />
              <span className="text-sm text-gray-400">to</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="border border-gray-200 px-3 py-1.5 rounded-full text-sm outline-none focus:ring-2 focus:ring-emerald-200 transition-all" />
            </>
          )}
        </div>

        {/* PIE + TABLE */}
        <div className="grid grid-cols-2 gap-6">

          {/* Pie chart card */}
          <div className="bg-[#fefefe] rounded-2xl overflow-hidden shadow-sm border border-gray-100">
            <div className="px-5 py-4">
              <span className="inline-flex items-center gap-2 bg-[#0bc184] text-white text-sm font-medium px-4 py-2 rounded-full shadow-sm">
                📅 {rangeLabel()}
              </span>
            </div>
            <div className="bg-white mx-0 rounded-t-2xl p-4">
              <div className="flex justify-center items-center">
                <PieChart width={380} height={340}>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={0}
                    outerRadius={130}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="#fff"
                    strokeWidth={3}
                    label={({ percent }) => percent > 0 ? `${(percent * 100).toFixed(1)}%` : ""}
                    labelLine={false}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" />
                </PieChart>
              </div>
            </div>
          </div>

          {/* Summary table card */}
          <div className="bg-white rounded-md border border-gray-300 shadow-sm overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#343a40] text-white">
                  <th className="px-6 py-4 text-left font-semibold border-r border-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left font-semibold">
                    Value
                  </th>
                </tr>
              </thead>

              <tbody>
                {summaryRows.map((row, index) => (
                  <tr
                    key={row.label}
                    className={`border-b border-gray-300 ${index === summaryRows.length - 1 ? "border-b-0" : ""
                      } hover:bg-gray-100`}
                  >
                    <td
                      className={`px-6 py-4 font-normal border-r border-gray-300 ${row.color}`}
                    >
                      {row.label}
                    </td>

                    <td className="px-6 py-4 text-gray-800 font-normal">
                      {row.value}

                      {stats.total > 0 && row.label !== "Total" && (
                        <span className="text-gray-600 font-normal">
                          {" "}
                          ({((row.value / stats.total) * 100).toFixed(2)}%)
                        </span>
                      )}
                    </td>
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