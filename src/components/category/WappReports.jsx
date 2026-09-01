import React, { useEffect, useState, useRef } from "react";
import { Calendar } from "lucide-react";
import * as XLSX from "xlsx";

const BASE = "https://latestchatway.onrender.com/api";

const WappReports = () => {
  const currentUser = JSON.parse(
    sessionStorage.getItem("user") || "null"
  );

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

  const [lightboxUrl, setLightboxUrl] = useState(null);

  const intervalRef = useRef(null);

  const filters = [
    "Today",
    "Yesterday",
    "Last 7 Days",
    "Last 30 Days",
    "This Month",
    "Last Month",
    "Custom Range",
  ];

  // ==========================================
  // FILE TYPE DETECTION
  // ==========================================

  const getFileKind = (url = "") => {
    const cleanUrl = String(url)
      .split("?")[0]
      .toLowerCase();

    if (
      cleanUrl.endsWith(".jpg") ||
      cleanUrl.endsWith(".jpeg") ||
      cleanUrl.endsWith(".png") ||
      cleanUrl.endsWith(".webp") ||
      cleanUrl.endsWith(".gif")
    ) {
      return "image";
    }

    if (
      cleanUrl.endsWith(".mp4") ||
      cleanUrl.endsWith(".webm") ||
      cleanUrl.endsWith(".mov") ||
      cleanUrl.endsWith(".avi")
    ) {
      return "video";
    }

    if (
      cleanUrl.endsWith(".mp3") ||
      cleanUrl.endsWith(".wav") ||
      cleanUrl.endsWith(".ogg") ||
      cleanUrl.endsWith(".m4a")
    ) {
      return "audio";
    }

    if (cleanUrl.endsWith(".pdf")) {
      return "pdf";
    }

    return "file";
  };

  // ==========================================
  // FETCH CAMPAIGNS
  // ==========================================

  const fetchCampaigns = async () => {
    if (!currentUser) return;

    setLoading(true);

    try {
      const res = await fetch(
        `${BASE}/my-campaigns/?user_id=${currentUser.id}`
      );

      const data = await res.json();

      if (data.status === "success") {
        setAllEntries(data.campaigns || []);
      }
    } catch (err) {
      console.error("Campaign Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // PAGE LOAD
  // ==========================================

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // ==========================================
  // AUTO REFRESH
  // ==========================================

  useEffect(() => {
    const hasPending = allEntries.some(
      (e) =>
        e.status === "pending" ||
        e.status === "sending" ||
        e.status === "scheduled"
    );

    if (hasPending) {
      intervalRef.current = setInterval(() => {
        fetchCampaigns();
      }, 60 * 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [allEntries]);

  // ==========================================
  // FILTER LOGIC
  // ==========================================

  useEffect(() => {
    if (selectedFilter === "Custom Range") {
      if (!customStart || !customEnd) {
        setEntries(allEntries);
        setPage(1);
        return;
      }
    }

    const now = new Date();
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;

    const todayIST = new Date(
      Math.floor(
        (now.getTime() + IST_OFFSET) / 86400000
      ) *
      86400000 -
      IST_OFFSET
    );

    let start;
    let end;

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
      const istNow = new Date(
        now.getTime() + IST_OFFSET
      );

      start = new Date(
        Date.UTC(
          istNow.getUTCFullYear(),
          istNow.getUTCMonth(),
          1
        ) - IST_OFFSET
      ).getTime();

      end = now.getTime();
    } else if (selectedFilter === "Last Month") {
      const istNow = new Date(
        now.getTime() + IST_OFFSET
      );

      start = new Date(
        Date.UTC(
          istNow.getUTCFullYear(),
          istNow.getUTCMonth() - 1,
          1
        ) - IST_OFFSET
      ).getTime();

      end =
        new Date(
          Date.UTC(
            istNow.getUTCFullYear(),
            istNow.getUTCMonth(),
            1
          ) - IST_OFFSET
        ).getTime() - 1;
    } else if (selectedFilter === "Custom Range") {
      start = new Date(customStart).getTime();

      end =
        new Date(customEnd).getTime() +
        86399999;
    }

    const filtered = allEntries.filter((e) => {
      let campaignDate = e.rawDate;

      if (!campaignDate && e.date) {
        campaignDate = new Date(e.date).getTime();
      }

      return (
        campaignDate >= start &&
        campaignDate <= end
      );
    });

    setEntries(filtered);
    setPage(1);
  }, [
    selectedFilter,
    allEntries,
    customStart,
    customEnd,
  ]);

  // ==========================================
  // DOWNLOAD EXCEL
  // ==========================================

  const handleDownload = (data) => {
    let rows = [];

    if (
      data.numberResults &&
      data.numberResults.length > 0
    ) {
      rows = data.numberResults.map((r) => ({
        Number: r.number,
        Status: (
          r.status || ""
        ).toUpperCase(),
      }));
    } else if (
      role === "admin" &&
      data.numberList &&
      data.numberList.length > 0
    ) {
      rows = data.numberList.map((num) => ({
        Number: num,
        Status: "PENDING",
      }));
    } else {
      alert(
        "No number data available for this campaign."
      );
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 20 },
      { wch: 15 },
    ];

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      "Campaign Report"
    );

    XLSX.writeFile(
      wb,
      `${data.name || "report"}.xlsx`
    );
  };

  // ==========================================
  // TOGGLE ROW
  // ==========================================

  const toggleRow = (i) => {
    setOpenRow(
      openRow === i ? null : i
    );
  };

  const totalPages = Math.ceil(
    entries.length / perPage
  );

  const paginated = entries.slice(
    (page - 1) * perPage,
    page * perPage
  );

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      {/* ================================= */}
      {/* TOP NOTE */}
      {/* ================================= */}

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 font-normal text-[18px]">
          NOTE = All campaigns will be delivered Between
          8A.M to 6P.M - (Monday to Saturday) on
          working days.
        </marquee>
      </div>

      <div className="p-4">

        <div className="bg-white border border-gray-300 rounded">

          {/* ================================= */}
          {/* HEADER */}
          {/* ================================= */}

          <div className="px-4 py-3 border-b flex items-center justify-between">

            <div className="flex items-center gap-3">

              <h2 className="font-semibold text-[18px] text-gray-800">
                Whatsapp Report
              </h2>

              <button
                onClick={fetchCampaigns}
                className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-600 px-3 py-1 rounded text-sm flex items-center gap-1"
              >
                🔄 Refresh
              </button>

              {allEntries.some(
                (e) =>
                  e.status === "pending"
              ) && (
                  <span className="bg-orange-100 text-orange-600 border border-orange-300 px-3 py-1 rounded text-xs animate-pulse">
                    ⏳ Your Pending Campaign Auto-Refresh
                  </span>
                )}

            </div>

            <div className="relative">

              <div
                onClick={() =>
                  setFilterOpen(!filterOpen)
                }
                className="flex items-center gap-2 bg-[#4DBD74] text-white px-4 py-2 rounded cursor-pointer"
              >
                <Calendar size={16} />
                {selectedFilter}
              </div>

              {filterOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-300 rounded shadow z-50">

                  {filters.map((f, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setSelectedFilter(f);
                        setFilterOpen(false);
                        setShowCustom(
                          f === "Custom Range"
                        );
                      }}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      {f}
                    </div>
                  ))}

                </div>
              )}

            </div>

          </div>

          {/* ================================= */}
          {/* CUSTOM DATE */}
          {/* ================================= */}

          {showCustom && (
            <div className="px-4 py-3 flex gap-3 items-center border-b bg-gray-50">

              <label className="text-sm">
                From:
              </label>

              <input
                type="date"
                value={customStart}
                onChange={(e) =>
                  setCustomStart(
                    e.target.value
                  )
                }
                className="border border-gray-300 px-2 py-1 rounded outline-none text-sm"
              />

              <label className="text-sm">
                To:
              </label>

              <input
                type="date"
                value={customEnd}
                onChange={(e) =>
                  setCustomEnd(
                    e.target.value
                  )
                }
                className="border border-gray-300 px-2 py-1 rounded outline-none text-sm"
              />

            </div>
          )}

          <div className="p-4">

            {/* ================================= */}
            {/* SHOW ENTRIES */}
            {/* ================================= */}

            <div className="mb-3 flex items-center gap-2 text-sm">

              <span>Show</span>

              <select
                className="border border-gray-300 px-2 py-1 rounded outline-none"
                value={perPage}
                onChange={(e) => {
                  setPerPage(
                    Number(e.target.value)
                  );

                  setPage(1);
                }}
              >
                <option value={10}>
                  10
                </option>

                <option value={25}>
                  25
                </option>

                <option value={50}>
                  50
                </option>
              </select>

              <span>entries</span>

            </div>

            {/* ================================= */}
            {/* TABLE */}
            {/* ================================= */}

            <div className="border border-gray-300 overflow-x-auto">

              <table className="w-full text-[15px] border-collapse text-center">

                <thead className="bg-[#3395b8] text-white">

                  <tr>

                    <th className="px-2 py-2 border-r border-gray-300"></th>

                    <th className="px-3 py-2 border-r border-gray-300">
                      Campname
                    </th>

                    <th className="px-3 py-2 border-r border-gray-300">
                      Number
                    </th>

                    <th className="px-3 py-2 border-r border-gray-300">
                      Message
                    </th>

                    <th className="px-3 py-2 border-r border-gray-300">
                      Status
                    </th>

                    <th className="px-3 py-2 border-r border-gray-300">
                      Submit Date
                    </th>

                    <th className="px-3 py-2">
                      Download
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {/* LOADING */}

                  {loading ? (

                    <tr>
                      <td
                        colSpan="7"
                        className="py-6 text-gray-500"
                      >
                        ⏳ Loading...
                      </td>
                    </tr>

                  ) : paginated.length === 0 ? (

                    <tr>
                      <td
                        colSpan="7"
                        className="py-6 text-gray-600"
                      >
                        No data available in table
                      </td>
                    </tr>

                  ) : (

                    paginated.map((e, i) => (

                      <React.Fragment
                        key={i}
                      >

                        {/* MAIN ROW */}

                        <tr className="border-t bg-gray-200">

                          <td className="border-r border-gray-300">

                            <button
                              onClick={() =>
                                toggleRow(i)
                              }
                              style={{
                                background: "#e74c3c",
                                color: "#fff",
                                width: "22px",
                                height: "22px",
                                borderRadius: "50%",
                                border: "2px solid #fff",
                                cursor: "pointer",
                                fontWeight: "bold",
                              }}
                            >
                              {openRow === i
                                ? "−"
                                : "+"}
                            </button>

                          </td>

                          <td className="px-3 py-2 border-r border-gray-300">
                            {e.name}
                          </td>

                          <td className="px-3 py-2 border-r border-gray-300">
                            {e.total}
                          </td>

                          <td className="px-3 py-2 border-r border-gray-300 max-w-[500px] text-left">
                            {e.message}
                          </td>

                          <td className="px-3 py-2 border-r border-gray-300">

                            {e.status === "pending" ? (

                              <span className="bg-orange-400 text-white px-2 py-1 text-xs rounded">
                                PENDING
                              </span>

                            ) : e.status === "rejected" ? (

                              <span className="bg-[#4DBD74] text-white px-2 py-1 text-xs rounded">
                                REJECTED
                              </span>

                            ) : (

                              <span className="bg-[#4DBD74] text-white px-2 py-1 text-xs rounded">
                                COMPLETED
                              </span>

                            )}

                          </td>

                          <td className="px-3 py-2 border-r border-gray-300">
                            {e.date}
                          </td>

                          <td className="px-3 py-2">

                            {(e.status ===
                              "completed" ||
                              e.status ===
                              "rejected" ||
                              role === "admin") ? (

                              <button
                                onClick={() =>
                                  handleDownload(e)
                                }
                                className="bg-[#3395b8] text-white px-4 py-2 rounded text-xs"
                              >
                                Download
                              </button>

                            ) : (

                              <button
                                disabled
                                className="bg-gray-300 text-gray-600 px-3 py-1 rounded text-xs cursor-not-allowed"
                              >
                                Pending
                              </button>

                            )}

                          </td>

                        </tr>

                        {/* ================================= */}
                        {/* EXPANDED REPORT */}
                        {/* ================================= */}

                        {openRow === i && (

                          <tr>

                            <td
                              colSpan="7"
                              style={{
                                background:
                                  "#f3f4f6",
                                padding: 0,
                              }}
                            >

                              <div
                                style={{
                                  width: "100%",
                                  border:
                                    "1px solid #cbd5e1",
                                  background:
                                    "#f8fafc",
                                }}
                              >

                                {/* ================= IMAGE / DP ================= */}

                                <div
                                  style={{
                                    display:
                                      "grid",
                                    gridTemplateColumns:
                                      "100px 1fr",
                                    borderBottom:
                                      "1px solid #cbd5e1",
                                    minHeight:
                                      "20px",
                                  }}
                                >

                                  <div
                                    style={{
                                      padding:
                                        "10px",
                                      fontWeight:
                                        "700",
                                      borderRight:
                                        "1px solid #cbd5e1",
                                      background:
                                        "#f1f5f9",
                                    }}
                                  >
                                    Image:
                                  </div>

                                  <div
                                    style={{
                                      padding:
                                        "9px",
                                      display:
                                        "flex",
                                      alignItems:
                                        "center",
                                      gap:
                                        "10px",
                                      flexWrap:
                                        "wrap",
                                    }}
                                  >

                                    {/* DP */}

                                    {e.dp_url && (

                                      <img
                                        src={
                                          e.dp_url
                                        }
                                        alt="Campaign DP"
                                        onClick={() =>
                                          setLightboxUrl(
                                            e.dp_url
                                          )
                                        }
                                        style={{
                                          width:
                                            "200px",
                                          height:
                                            "200px",
                                          objectFit:
                                            "cover",
                                          cursor:
                                            "pointer",
                                          border:
                                            "1px solid #ccc",
                                        }}
                                      />

                                    )}

                                    {/* IMAGE FILES */}

                                    {(e.file_urls ||
                                      [])
                                      .filter(
                                        (url) =>
                                          getFileKind(
                                            url
                                          ) ===
                                          "image"
                                      )
                                      .map(
                                        (
                                          url,
                                          fi
                                        ) => (

                                          <img
                                            key={
                                              fi
                                            }
                                            src={
                                              url
                                            }
                                            alt={`Attachment ${fi}`}
                                            onClick={() =>
                                              setLightboxUrl(
                                                url
                                              )
                                            }
                                            style={{
                                              width:
                                                "200px",
                                              height:
                                                "200px",
                                              objectFit:
                                                "cover",
                                              cursor:
                                                "pointer",
                                              border:
                                                "1px solid #ccc",
                                            }}
                                          />

                                        )
                                      )}

                                    {!e.dp_url &&
                                      !(e.file_urls ||
                                        []).some(
                                          (url) =>
                                            getFileKind(
                                              url
                                            ) ===
                                            "image"
                                        ) && (
                                        <span
                                          style={{
                                            color:
                                              "#777",
                                          }}
                                        >
                                          No Image
                                        </span>
                                      )}

                                  </div>

                                </div>

                                {/* ================= VIDEO ================= */}

                                <div
                                  style={{
                                    display:
                                      "grid",
                                    gridTemplateColumns:
                                      "100px 1fr",
                                    borderBottom:
                                      "1px solid #cbd5e1",
                                    minHeight:
                                      "20px",
                                  }}
                                >

                                  <div
                                    style={{
                                      padding:
                                        "10px",
                                      fontWeight:
                                        "700",
                                      borderRight:
                                        "1px solid #cbd5e1",
                                      background:
                                        "#f1f5f9",
                                    }}
                                  >
                                    Video:
                                  </div>

                                  <div
                                    style={{
                                      padding:
                                        "8px",
                                      display:
                                        "flex",
                                      gap:
                                        "10px",
                                      flexWrap:
                                        "wrap",
                                    }}
                                  >

                                    {(e.file_urls ||
                                      [])
                                      .filter(
                                        (url) =>
                                          getFileKind(
                                            url
                                          ) ===
                                          "video"
                                      )
                                      .map(
                                        (
                                          url,
                                          fi
                                        ) => (

                                          <video
                                            key={
                                              fi
                                            }
                                            src={
                                              url
                                            }
                                            controls
                                            style={{
                                              width:
                                                "350px",
                                              maxWidth:
                                                "100%",
                                              border:
                                                "1px solid #ccc",
                                            }}
                                          />

                                        )
                                      )}

                                  </div>

                                </div>

                                {/* ================= AUDIO ================= */}

                                <div
                                  style={{
                                    display:
                                      "grid",
                                    gridTemplateColumns:
                                      "100px 1fr",
                                    borderBottom:
                                      "1px solid #cbd5e1",
                                    minHeight:
                                      "20px",
                                  }}
                                >

                                  <div
                                    style={{
                                      padding:
                                        "10px",
                                      fontWeight:
                                        "700",
                                      borderRight:
                                        "1px solid #cbd5e1",
                                      background:
                                        "#f1f5f9",
                                    }}
                                  >
                                    Audio:
                                  </div>

                                  <div
                                    style={{
                                      padding:
                                        "8px",
                                      display:
                                        "flex",
                                      gap:
                                        "10px",
                                      flexWrap:
                                        "wrap",
                                    }}
                                  >

                                    {(e.file_urls ||
                                      [])
                                      .filter(
                                        (url) =>
                                          getFileKind(
                                            url
                                          ) ===
                                          "audio"
                                      )
                                      .map(
                                        (
                                          url,
                                          fi
                                        ) => (

                                          <audio
                                            key={
                                              fi
                                            }
                                            src={
                                              url
                                            }
                                            controls
                                          />

                                        )
                                      )}

                                  </div>

                                </div>

                                {/* ================= PDF ================= */}

                                <div
                                  style={{
                                    display:
                                      "grid",
                                    gridTemplateColumns:
                                      "100px 1fr",
                                    borderBottom:
                                      "1px solid #cbd5e1",
                                    minHeight:
                                      "20px",
                                  }}
                                >

                                  <div
                                    style={{
                                      padding:
                                        "10px",
                                      fontWeight:
                                        "700",
                                      borderRight:
                                        "1px solid #cbd5e1",
                                      background:
                                        "#f1f5f9",
                                    }}
                                  >
                                    PDF:
                                  </div>

                                  <div
                                    style={{
                                      padding:
                                        "8px",
                                      display:
                                        "flex",
                                      gap:
                                        "10px",
                                      flexWrap:
                                        "wrap",
                                    }}
                                  >

                                    {(e.file_urls ||
                                      [])
                                      .filter(
                                        (url) =>
                                          getFileKind(
                                            url
                                          ) ===
                                          "pdf"
                                      )
                                      .map(
                                        (
                                          url,
                                          fi
                                        ) => (

                                          <a
                                            key={
                                              fi
                                            }
                                            href={
                                              url
                                            }
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{
                                              display:
                                                "inline-flex",
                                              alignItems:
                                                "center",
                                              padding:
                                                "9px 15px",
                                              background:
                                                "#dc2626",
                                              color:
                                                "#fff",
                                              textDecoration:
                                                "none",
                                              borderRadius:
                                                "5px",
                                              fontWeight:
                                                "600",
                                            }}
                                          >
                                            📄 Open PDF
                                          </a>

                                        )
                                      )}

                                  </div>

                                </div>

                                {/* ================= LINK BUTTON ================= */}

                                <div
                                  style={{
                                    display:
                                      "grid",
                                    gridTemplateColumns:
                                      "100px 1fr",
                                    borderBottom:
                                      "1px solid #cbd5e1",
                                    minHeight:
                                      "25px",
                                  }}
                                >

                                  <div
                                    style={{
                                      padding:
                                        "10px",
                                      fontWeight:
                                        "700",
                                      borderRight:
                                        "1px solid #cbd5e1",
                                      background:
                                        "#f1f5f9",
                                    }}
                                  >
                                    Link Button:
                                  </div>

                                  <div
                                    style={{
                                      padding:
                                        "8px",
                                      display:
                                        "flex",
                                      alignItems:
                                        "center",
                                      gap:
                                        "10px",
                                      flexWrap:
                                        "wrap",
                                    }}
                                  >

                                    {e.link_url ? (

                                      <>

                                        <a
                                          href={
                                            e.link_url
                                          }
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{
                                            display:
                                              "inline-flex",
                                            alignItems:
                                              "center",
                                            justifyContent:
                                              "center",
                                            padding:
                                              "10px 22px",
                                            background:
                                              "#20a8d8",
                                            color:
                                              "#ffffff",
                                            textDecoration:
                                              "none",
                                            borderRadius:
                                              "6px",
                                            fontWeight:
                                              "700",
                                            fontSize:
                                              "14px",
                                            cursor:
                                              "pointer",
                                            border:
                                              "none",
                                            boxShadow:
                                              "0 2px 5px rgba(0,0,0,0.2)",
                                          }}
                                        >
                                          🔗{" "}
                                          {e.link_label ||
                                            "Visit Now"}
                                        </a>

                                        <span
                                          style={{
                                            color:
                                              "#555",
                                            fontSize:
                                              "13px",
                                            wordBreak:
                                              "break-all",
                                          }}
                                        >
                                          {e.link_url}
                                        </span>

                                      </>

                                    ) : (

                                      <span
                                        style={{
                                          color:
                                            "#777",
                                        }}
                                      >
                                        No Link Button
                                      </span>

                                    )}

                                  </div>

                                </div>

                                {/* ================= CALL BUTTON ================= */}

                                <div
                                  style={{
                                    display:
                                      "grid",
                                    gridTemplateColumns:
                                      "100px 1fr",
                                    borderBottom:
                                      "1px solid #cbd5e1",
                                    minHeight:
                                      "25px",
                                  }}
                                >

                                  <div
                                    style={{
                                      padding:
                                        "10px",
                                      fontWeight:
                                        "700",
                                      borderRight:
                                        "1px solid #cbd5e1",
                                      background:
                                        "#f1f5f9",
                                    }}
                                  >
                                    Call Button:
                                  </div>

                                  <div
                                    style={{
                                      padding:
                                        "8px",
                                      display:
                                        "flex",
                                      alignItems:
                                        "center",
                                      gap:
                                        "10px",
                                      flexWrap:
                                        "wrap",
                                    }}
                                  >

                                    {e.call_number ? (

                                      <>

                                        <a
                                          href={`tel:${e.call_number}`}
                                          style={{
                                            display:
                                              "inline-flex",
                                            alignItems:
                                              "center",
                                            justifyContent:
                                              "center",
                                            padding:
                                              "10px 22px",
                                            background:
                                              "#4dbd74",
                                            color:
                                              "#ffffff",
                                            textDecoration:
                                              "none",
                                            borderRadius:
                                              "6px",
                                            fontWeight:
                                              "700",
                                            fontSize:
                                              "14px",
                                            cursor:
                                              "pointer",
                                            border:
                                              "none",
                                            boxShadow:
                                              "0 2px 5px rgba(0,0,0,0.2)",
                                          }}
                                        >
                                          📞{" "}
                                          {e.call_label ||
                                            "Call Now"}
                                        </a>

                                        <span
                                          style={{
                                            color:
                                              "#555",
                                            fontSize:
                                              "14px",
                                          }}
                                        >
                                          {e.call_number}
                                        </span>

                                      </>

                                    ) : (

                                      <span
                                        style={{
                                          color:
                                            "#777",
                                        }}
                                      >
                                        No Call Button
                                      </span>

                                    )}

                                  </div>

                                </div>

                                {/* ================= STATS ================= */}

                                <div
                                  style={{
                                    padding:
                                      "8px",
                                    display:
                                      "flex",
                                    gap:
                                      "2px",
                                    flexWrap:
                                      "wrap",
                                  }}
                                >

                                  <span
                                    style={{
                                      display: "inline-flex",
                                      background: "#2993b7",
                                      color: "#fff",
                                      padding: "6px 10px",
                                      fontWeight: "700",
                                      fontSize: "12px",
                                    }}
                                  >
                                    TOTAL
                                    <span
                                      style={{
                                        marginLeft:
                                          "8px",
                                      }}
                                    >
                                      {e.total ||
                                        0}
                                    </span>
                                  </span>

                                  <span
                                    style={{
                                      display: "inline-flex",
                                      background: "#2993b7",
                                      color: "#fff",
                                      padding: "6px 10px",
                                      fontWeight: "700",
                                      fontSize: "12px",
                                    }}
                                  >
                                    NONWA
                                    <span
                                      style={{
                                        marginLeft:
                                          "8px",
                                      }}
                                    >
                                      {e.nonwa ||
                                        0}
                                    </span>
                                  </span>

                                  <span
                                    style={{
                                      display: "inline-flex",
                                      background: "#2993b7",
                                      color: "#fff",
                                      padding: "6px 10px",
                                      fontWeight: "700",
                                      fontSize: "12px",
                                    }}
                                  >
                                    FAILED
                                    <span
                                      style={{
                                        marginLeft:
                                          "8px",
                                      }}
                                    >
                                      {e.failed ||
                                        0}
                                    </span>
                                  </span>

                                  <span
                                    style={{
                                      display: "inline-flex",
                                      background: "#2993b7",
                                      color: "#fff",
                                      padding: "6px 10px",
                                      fontWeight: "700",
                                      fontSize: "12px",
                                    }}
                                  >
                                    REJECTED
                                    <span
                                      style={{
                                        marginLeft:
                                          "8px",
                                      }}
                                    >
                                      {e.rejected ||
                                        0}
                                    </span>
                                  </span>

                                  <span
                                    style={{
                                      display: "inline-flex",
                                      background: "#2993b7",
                                      color: "#fff",
                                      padding: "6px 10px",
                                      fontWeight: "700",
                                      fontSize: "12px",
                                    }}
                                  >
                                    VALIDNO
                                    <span
                                      style={{
                                        marginLeft:
                                          "8px",
                                      }}
                                    >
                                      {e.success ||
                                        0}
                                    </span>
                                  </span>

                                </div>

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

            {/* ================================= */}
            {/* PAGINATION */}
            {/* ================================= */}

            <div className="flex justify-between mt-4 text-sm">

              <span>

                Showing{" "}

                {entries.length === 0
                  ? 0
                  : (page - 1) *
                  perPage +
                  1}

                –

                {Math.min(
                  page * perPage,
                  entries.length
                )}

                {" "}of{" "}

                {entries.length}

                {" "}entries

              </span>

              <div className="flex gap-2">

                <button
                  onClick={() =>
                    setPage((p) =>
                      Math.max(p - 1, 1)
                    )
                  }
                  disabled={page === 1}
                  className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40"
                >
                  Previous
                </button>

                <button
                  onClick={() =>
                    setPage((p) =>
                      Math.min(
                        p + 1,
                        totalPages
                      )
                    )
                  }
                  disabled={
                    page === totalPages ||
                    totalPages === 0
                  }
                  className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40"
                >
                  Next
                </button>

              </div>

            </div>

          </div>

        </div>

      </div>

      {/* ================================= */}
      {/* IMAGE LIGHTBOX */}
      {/* ================================= */}

      {lightboxUrl && (

        <div
          onClick={() =>
            setLightboxUrl(null)
          }
          style={{
            position: "fixed",
            inset: 0,
            background:
              "rgba(0,0,0,0.85)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            cursor: "pointer",
          }}
        >

          <img
            src={lightboxUrl}
            alt="Preview"
            style={{
              maxWidth: "95%",
              maxHeight: "95%",
              objectFit: "contain",
              borderRadius: "8px",
            }}
          />

        </div>

      )}

    </div>
  );
};

export default WappReports;