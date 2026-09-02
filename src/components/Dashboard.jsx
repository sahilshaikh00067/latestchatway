import React, { useEffect, useState, useRef } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

const BASE = "https://latestchatway.onrender.com/api";

const COLORS = [
  "#09e393",
  "#3b82f6",
  "#F86C6B",
  "#f97316",
];

const filters = [
  "Today",
  "Yesterday",
  "Last 7 Days",
  "Last 30 Days",
  "Custom Range",
];

const Dashboard = () => {
  const [selectedFilter, setSelectedFilter] = useState("Today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [allCampaigns, setAllCampaigns] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    success: 0,
    failed: 0,
    nonwa: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const intervalRef = useRef(null);

  // ─────────────────────────────────────────
  // FETCH CAMPAIGNS
  // ─────────────────────────────────────────
  const fetchCampaigns = async (manualRefresh = false) => {
    try {
      const userData = sessionStorage.getItem("user");

      if (!userData) {
        setLoading(false);
        return;
      }

      const currentUser = JSON.parse(userData);

      if (!currentUser || !currentUser.id) {
        setLoading(false);
        return;
      }

      if (manualRefresh) {
        setRefreshing(true);
      }

      const response = await fetch(
        `${BASE}/my-campaigns/?user_id=${currentUser.id}`
      );

      const data = await response.json();

      if (
        data &&
        data.status === "success" &&
        Array.isArray(data.campaigns)
      ) {
        setAllCampaigns(data.campaigns);
      } else {
        setAllCampaigns([]);
      }
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

  };

  // ─────────────────────────────────────────
  // INITIAL FETCH
  // ─────────────────────────────────────────
  useEffect(() => {
    fetchCampaigns();
  }, []);

  // ─────────────────────────────────────────
  // AUTO REFRESH PENDING CAMPAIGNS
  // ─────────────────────────────────────────
  useEffect(() => {
    const hasPendingCampaign = allCampaigns.some(
      (campaign) =>
        String(campaign.status || "").toLowerCase() ===
        "pending"
    );

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (hasPendingCampaign) {
      intervalRef.current = setInterval(() => {
        fetchCampaigns();
      }, 60000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };

  }, [allCampaigns]);

  // ─────────────────────────────────────────
  // FILTER + CALCULATE STATS
  // ─────────────────────────────────────────
  useEffect(() => {
    const now = new Date();

    const IST_OFFSET = 5.5 * 60 * 60 * 1000;

    const todayIST = new Date(
      Math.floor(
        (now.getTime() + IST_OFFSET) / 86400000
      ) *
      86400000 -
      IST_OFFSET
    );

    let start = 0;
    let end = now.getTime();

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
      if (!fromDate || !toDate) {
        setStats({
          total: 0,
          success: 0,
          failed: 0,
          nonwa: 0,
          rejected: 0,
        });

        return;
      }

      start = new Date(
        `${fromDate}T00:00:00`
      ).getTime();

      end = new Date(
        `${toDate}T23:59:59.999`
      ).getTime();
    }

    const filteredCampaigns = allCampaigns.filter(
      (campaign) => {
        const status = String(
          campaign.status || ""
        ).toLowerCase();

        const campaignDate = Number(
          campaign.rawDate
        );

        return (
          status === "completed" &&
          campaignDate >= start &&
          campaignDate <= end
        );
      }
    );

    let total = 0;
    let success = 0;
    let failed = 0;
    let nonwa = 0;
    let rejected = 0;

    filteredCampaigns.forEach((campaign) => {
      total += Number(campaign.total) || 0;
      success += Number(campaign.success) || 0;
      failed += Number(campaign.failed) || 0;
      nonwa += Number(campaign.nonwa) || 0;
      rejected += Number(campaign.rejected) || 0;
    });

    setStats({
      total,
      success,
      failed,
      nonwa,
      rejected,
    });

  }, [
    selectedFilter,
    fromDate,
    toDate,
    allCampaigns,
  ]);

  // ─────────────────────────────────────────
  // PENDING STATUS
  // ─────────────────────────────────────────
  const hasPending = allCampaigns.some(
    (campaign) =>
      String(campaign.status || "").toLowerCase() ===
      "pending"
  );

  // ─────────────────────────────────────────
  // PIE DATA
  // ─────────────────────────────────────────
  const pieData = [
    {
      name: "Success",
      value: stats.success,
    },
    {
      name: "NonWA",
      value: stats.nonwa,
    },
    {
      name: "Failed",
      value: stats.failed,
    },
    {
      name: "Rejected",
      value: stats.rejected,
    },
  ];

  // ─────────────────────────────────────────
  // DATE RANGE LABEL
  // ─────────────────────────────────────────
  const rangeLabel = () => {
    const options = {
      month: "long",
      day: "numeric",
      year: "numeric",
    };

    if (
      selectedFilter === "Custom Range" &&
      fromDate &&
      toDate
    ) {
      const from = new Date(
        `${fromDate}T00:00:00`
      ).toLocaleDateString(
        "en-US",
        options
      );

      const to = new Date(
        `${toDate}T00:00:00`
      ).toLocaleDateString(
        "en-US",
        options
      );

      return `${from} - ${to}`;
    }

    return selectedFilter;

  };

  // ─────────────────────────────────────────
  // SUMMARY DATA
  // ─────────────────────────────────────────
  const summaryRows = [
    {
      label: "Total",
      value: stats.total,
      color: "bg-gray-700",
    },
    {
      label: "SUCCESS",
      value: stats.success,
      color: "bg-[#09e393]",
    },
    {
      label: "NONWA",
      value: stats.nonwa,
      color: "bg-[#3b82f6]",
    },
    {
      label: "FAILED",
      value: stats.failed,
      color: "bg-[#F86C6B]",
    },
    {
      label: "REJECTED",
      value: stats.rejected,
      color: "bg-[#f97316]",
    },
  ];

  const formatNumber = (value) => {
    return Number(value || 0).toLocaleString(
      "en-IN"
    );
  };

  // ─────────────────────────────────────────
  // LOADING SCREEN
  // ─────────────────────────────────────────
  if (loading) {
    return (<div className="min-h-screen bg-[#eef1f5] p-6"> <div className="max-w-[1400px] mx-auto"> <div className="bg-white rounded-2xl p-10 text-center shadow-sm"> <div className="w-10 h-10 mx-auto mb-4 border-4 border-gray-200 border-t-[#0bc184] rounded-full animate-spin"></div>

      <div className="text-gray-500 font-medium">
        Loading Dashboard...
      </div>
    </div>
    </div>
    </div>
    );

  }

  return (<div className="min-h-screen bg-[#eef1f5]">

    <style>
      {`
      @keyframes dashboardMarquee {
        0% {
          transform: translateX(0);
        }

        100% {
          transform: translateX(-50%);
        }
      }

      .dashboard-marquee-track {
        width: max-content;
        animation: dashboardMarquee 22s linear infinite;
        will-change: transform;
      }

      .dashboard-marquee-track:hover {
        animation-play-state: paused;
      }

      @media (max-width: 768px) {
        .dashboard-marquee-track {
          animation-duration: 14s;
        }
      }
    `}
    </style>

    {/* ───────────────────────────────────── */}
    {/* SMOOTH SLIDING ANNOUNCEMENT */}
    {/* ───────────────────────────────────── */}


    <div className="bg-gray-200">
      <marquee className="text-red-600 py-2 text-[18px]">
        NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday)
      </marquee>
    </div>

    <div className="p-3 sm:p-4 md:p-6 max-w-[1400px] mx-auto">

      {/* ───────────────────────────────────── */}
      {/* PENDING ALERT */}
      {/* ───────────────────────────────────── */}
      {hasPending && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm transition-all duration-300 hover:shadow-md">

          <div className="flex items-center gap-3 text-orange-600 text-sm font-medium">
            <span className="text-xl animate-pulse">
              ⏳
            </span>

            <div>
              <div>
                Your Campaign is Pending. Wait For Few Minutes.
              </div>

              <div className="text-xs text-orange-500 mt-1">
                Dashboard refreshes automatically every minute.
              </div>
            </div>
          </div>

          <button
            onClick={() => fetchCampaigns(true)}
            disabled={refreshing}
            className="bg-orange-400 hover:bg-orange-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95"
          >
            {refreshing
              ? "Refreshing..."
              : "🔄 Refresh"}
          </button>
        </div>
      )}

      {/* ───────────────────────────────────── */}
      {/* FILTER BAR */}
      {/* ───────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-5 shadow-sm transition-all duration-300 hover:shadow-md">

        <div className="flex flex-col xl:flex-row xl:items-center gap-3">

          <div className="flex items-center gap-2 flex-wrap">

            <span className="text-sm font-semibold text-gray-500 mr-1">
              Filter
            </span>

            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  setSelectedFilter(filter);

                  if (filter !== "Custom Range") {
                    setFromDate("");
                    setToDate("");
                  }
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 active:scale-95 ${selectedFilter === filter
                    ? "bg-[#0bc184] text-white shadow-md"
                    : "bg-gray-50 hover:bg-gray-100 hover:shadow-sm text-gray-600"
                  }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {selectedFilter === "Custom Range" && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 xl:ml-auto">

              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                }}
                className="border border-gray-200 px-4 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#09e393]/30 focus:border-[#09e393] transition-all"
              />

              <span className="text-gray-400 text-center">
                to
              </span>

              <input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                }}
                className="border border-gray-200 px-4 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#09e393]/30 focus:border-[#09e393] transition-all"
              />

            </div>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────── */}
      {/* MAIN DASHBOARD GRID */}
      {/* ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">

        {/* PIE CHART */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">

          <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-gray-50">

            <span className="inline-flex items-center gap-2 bg-[#0bc184] text-white text-sm font-medium px-4 py-2 rounded-full shadow-sm">
              📅 {rangeLabel()}
            </span>

            <span className="hidden sm:inline text-xs text-gray-400">
              Completed Campaigns
            </span>
          </div>

          <div className="p-4 flex justify-center">

            {stats.total > 0 ? (
              <PieChart
                width={380}
                height={340}
              >
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={125}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="#ffffff"
                  strokeWidth={3}
                  label={({ percent }) =>
                    percent > 0
                      ? `${(
                        percent * 100
                      ).toFixed(1)}%`
                      : ""
                  }
                  labelLine={false}
                >
                  {pieData.map(
                    (entry, index) => (
                      <Cell
                        key={`${entry.name}-${index}`}
                        fill={COLORS[index]}
                      />
                    )
                  )}
                </Pie>

                <Tooltip />

                <Legend iconType="circle" />
              </PieChart>
            ) : (
              <div className="h-[340px] flex flex-col items-center justify-center">

                <div className="text-5xl mb-4">
                  📊
                </div>

                <div className="font-semibold text-gray-700">
                  No Campaign Data
                </div>

                <div className="text-sm text-gray-400 mt-2 text-center">
                  No completed campaigns found for this period.
                </div>

              </div>
            )}
          </div>
        </div>

        {/* SUMMARY */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">

          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">

            <div>
              <h2 className="font-bold text-gray-800">
                Campaign Summary
              </h2>

              <p className="text-xs text-gray-400 mt-1">
                Performance overview
              </p>
            </div>

            <button
              onClick={() => fetchCampaigns(true)}
              disabled={refreshing}
              className="bg-gray-50 hover:bg-gray-100 border border-gray-200 px-4 py-2 rounded-xl text-sm text-gray-600 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {refreshing
                ? "Loading..."
                : "↻ Refresh"}
            </button>
          </div>

          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead>
                <tr className="bg-[#343a40] text-white">

                  <th className="px-6 py-4 text-left font-semibold">
                    Status
                  </th>

                  <th className="px-6 py-4 text-right font-semibold">
                    Value
                  </th>

                  <th className="px-6 py-4 text-right font-semibold">
                    Percentage
                  </th>

                </tr>
              </thead>

              <tbody>
                {summaryRows.map((row) => {

                  const percentage =
                    row.label === "Total"
                      ? "100.00"
                      : stats.total > 0
                        ? (
                          (row.value / stats.total) *
                          100
                        ).toFixed(2)
                        : "0.00";

                  return (
                    <tr
                      key={row.label}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200"
                    >

                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">

                          <span
                            className={`w-2.5 h-2.5 rounded-full ${row.color}`}
                          ></span>

                          <span className="font-medium text-gray-700">
                            {row.label}
                          </span>

                        </div>
                      </td>

                      <td className="px-6 py-5 text-right font-semibold text-gray-800">
                        {formatNumber(row.value)}
                      </td>

                      <td className="px-6 py-5 text-right text-gray-500">
                        {percentage}%
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 flex items-center justify-between">

            <span className="text-sm text-gray-500">
              Total Messages
            </span>

            <span className="text-xl font-bold text-[#0bc184]">
              {formatNumber(stats.total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>

  );
};

export default Dashboard;
