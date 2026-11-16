export const CREW_SCHEDULE_DATA = {
  "year": 2026,
  "source": "2026_ Crew Schedules (Master) 2(AutoRecovered).xlsx",
  "sheet": "Crew - Schedule - 2026 (2)",
  "rules": {
    "defaultRotationDays": 42,
    "mechanicRotationDays": 28,
    "calendarStarts": "2025-12-08",
    "calendarEnds": "2026-12-31"
  },
  "sites": {
    "IQA": "Iqaluit",
    "POND": "Pond Inlet",
    "ALRT": "Alert",
    "KUG": "Kugluktuk",
    "TBC": "Site to be confirmed",
    "Out": "Off rotation",
    "In": "Arriving",
    "Transfer": "In transit"
  },
  "projects": [],
  "people": [
    {
      "id": "eric-jacobsen-manager",
      "name": "Eric Jacobsen",
      "role": "Manager",
      "sheetRow": 4,
      "active": true,
      "homeSites": [
        "IQA",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": "2026-05-26",
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-05-07",
          "mark": "IQA"
        },
        {
          "date": "2026-05-26",
          "mark": "Out"
        },
        {
          "date": "2026-07-06",
          "mark": "POND"
        },
        {
          "date": "2026-07-08",
          "mark": "IQA"
        },
        {
          "date": "2026-08-26",
          "mark": "POND"
        },
        {
          "date": "2026-08-28",
          "mark": "Out"
        },
        {
          "date": "2026-09-23",
          "mark": "IQA"
        },
        {
          "date": "2026-10-07",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-05-07",
          "out": "2026-05-26",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "POND",
          "sites": [
            "POND",
            "IQA",
            "POND"
          ],
          "from": "2026-07-06",
          "out": "2026-08-28",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-09-23",
          "out": "2026-10-07",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": [
        "OUT typed on 2026-06-04 while already off site",
        "shaded 2026-08-29 to 2026-09-22 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ],
      "fullName": "Eric Jacobsen",
      "flights": [
        {
          "arriveIqa": "2026-01-29",
          "arriveRef": "QJREWT",
          "departIqa": "2026-02-03",
          "departRef": "BAHQHA",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-02-08",
          "arriveRef": "QZQDLC",
          "departIqa": "2026-03-12",
          "departRef": "KPOHUT",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-03-20",
          "arriveRef": "KPOHUT",
          "departIqa": "2026-03-29",
          "departRef": "GLVVBE",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-04-03",
          "arriveRef": "JAHVXW",
          "departIqa": "2026-04-30",
          "departRef": "JAHVXW",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-05-07",
          "arriveRef": "GLVVBE",
          "departIqa": "2026-05-26",
          "departRef": "UHAXJS",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-06-04",
          "arriveRef": "UHAXJS",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-07-06",
          "arriveRef": "KQHBKK",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-07-08",
          "arriveRef": "KQHBKK",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        }
      ]
    },
    {
      "id": "simon-plourde-manager",
      "name": "Simon Plourde",
      "role": "Manager",
      "sheetRow": 5,
      "active": true,
      "homeSites": [
        "ALRT",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-05-31",
          "mark": "YK"
        },
        {
          "date": "2026-06-01",
          "mark": "KUG"
        },
        {
          "date": "2026-06-02",
          "mark": "Out"
        },
        {
          "date": "2026-07-13",
          "mark": "via ALRT"
        },
        {
          "date": "2026-07-14",
          "mark": "ALRT"
        },
        {
          "date": "2026-07-29",
          "mark": "Out"
        },
        {
          "date": "2026-08-31",
          "mark": "IQA"
        },
        {
          "date": "2026-09-02",
          "mark": "POND"
        },
        {
          "date": "2026-09-04",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "KUG",
          "sites": [
            "KUG"
          ],
          "from": "2026-06-01",
          "out": "2026-06-02",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "ALRT",
          "sites": [
            "ALRT"
          ],
          "from": "2026-07-14",
          "out": "2026-07-29",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA",
            "POND"
          ],
          "from": "2026-08-31",
          "out": "2026-09-04",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": []
    },
    {
      "id": "maegan-ellison-manager",
      "name": "Maegan Ellison",
      "role": "Manager",
      "sheetRow": 6,
      "active": true,
      "homeSites": [
        "ALRT"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": "2026-06-11",
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-06-08",
          "mark": "IQA"
        },
        {
          "date": "2026-06-11",
          "mark": "Out"
        },
        {
          "date": "2026-08-03",
          "mark": "ALRT"
        },
        {
          "date": "2026-08-19",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-06-08",
          "out": "2026-06-11",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "ALRT",
          "sites": [
            "ALRT"
          ],
          "from": "2026-08-03",
          "out": "2026-08-19",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [],
      "agreementSigned": true
    },
    {
      "id": "william-matthews-manager",
      "name": "William Matthews",
      "role": "Manager",
      "sheetRow": 7,
      "active": true,
      "homeSites": [
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-09-22",
          "mark": "Out"
        }
      ],
      "stints": [],
      "warnings": [
        "shaded 2026-09-13 to 2026-09-21 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ],
      "agreementSigned": true
    },
    {
      "id": "bryan-hay-surveyor",
      "name": "Bryan Hay",
      "role": "Surveyor",
      "sheetRow": 9,
      "active": true,
      "homeSites": [
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-04-27",
          "mark": "IQA"
        },
        {
          "date": "2026-06-08",
          "mark": "Out"
        },
        {
          "date": "2026-06-22",
          "mark": "IQA"
        },
        {
          "date": "2026-08-20",
          "mark": "Out"
        },
        {
          "date": "2026-08-31",
          "mark": "IQA"
        },
        {
          "date": "2026-10-07",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-04-27",
          "out": "2026-06-08",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-06-22",
          "out": "2026-08-20",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-08-31",
          "out": "2026-10-07",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": [],
      "fullName": "Bryan Hay",
      "flights": [
        {
          "arriveIqa": "2026-04-27",
          "arriveRef": "SZBDKW",
          "departIqa": "2026-06-08",
          "departRef": "DHQOPO",
          "camp": null,
          "carService": "Confirmed",
          "note": null
        },
        {
          "arriveIqa": "2026-06-22",
          "arriveRef": "DHQOPO",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": "Confirmed",
          "note": null
        }
      ],
      "agreementSigned": true
    },
    {
      "id": "andrew-murphy-surveyor",
      "name": "Andrew Murphy",
      "role": "Surveyor",
      "sheetRow": 10,
      "active": true,
      "homeSites": [
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-06-29",
          "mark": "via IQA"
        },
        {
          "date": "2026-06-30",
          "mark": "IQA"
        },
        {
          "date": "2026-08-10",
          "mark": "Out"
        },
        {
          "date": "2026-08-28",
          "mark": "IQA"
        },
        {
          "date": "2026-10-07",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-06-30",
          "out": "2026-08-10",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-08-28",
          "out": "2026-10-07",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": [],
      "fullName": "Andrew Murphy",
      "flights": [
        {
          "arriveIqa": "2026-06-29",
          "arriveRef": "BRZARF",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        }
      ]
    },
    {
      "id": "kirk-operator-truck-driver",
      "name": "Clifford Kirk Anstey",
      "role": "Operator/Truck Driver",
      "sheetRow": 12,
      "active": true,
      "homeSites": [
        "KUG",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-03-30",
          "mark": "Out"
        },
        {
          "date": "2026-04-13",
          "mark": "IQA"
        },
        {
          "date": "2026-05-25",
          "mark": "Out"
        },
        {
          "date": "2026-06-08",
          "mark": "KUG"
        },
        {
          "date": "2026-07-20",
          "mark": "Out"
        },
        {
          "date": "2026-08-14",
          "mark": "IQA"
        },
        {
          "date": "2026-08-17",
          "mark": "POND"
        },
        {
          "date": "2026-10-10",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-04-13",
          "out": "2026-05-25",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "KUG",
          "sites": [
            "KUG"
          ],
          "from": "2026-06-08",
          "out": "2026-07-20",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA",
            "POND"
          ],
          "from": "2026-08-14",
          "out": "2026-10-10",
          "arrival": "marked",
          "departure": "next-mark",
          "tentative": false
        }
      ],
      "warnings": [
        "unreadable mark 'Book' on 2026-10-10"
      ],
      "fullName": "Clifford Kirk Anstey",
      "flights": [
        {
          "arriveIqa": "2026-01-12",
          "arriveRef": "LAMNOH",
          "departIqa": "2026-02-16",
          "departRef": "KVPLFA",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-03-02",
          "arriveRef": "KVPLFA",
          "departIqa": "2026-03-31",
          "departRef": "FEWHEF",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-04-13",
          "arriveRef": "FEWHEF",
          "departIqa": "2026-05-25",
          "departRef": "AZVCFA",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-06-06",
          "arriveRef": "CKHYMT",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        }
      ],
      "agreementSigned": true
    },
    {
      "id": "sam-m-operator-truck-driver",
      "name": "Sam Manniapik",
      "role": "Operator/Truck Driver",
      "category": "Local",
      "sheetRow": 13,
      "active": true,
      "homeSites": [
        "KUG",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-04-06",
          "mark": "Out"
        },
        {
          "date": "2026-04-20",
          "mark": "IQA"
        },
        {
          "date": "2026-05-18",
          "mark": "Out"
        },
        {
          "date": "2026-05-31",
          "mark": "via IQA"
        },
        {
          "date": "2026-06-01",
          "mark": "YF"
        },
        {
          "date": "2026-06-02",
          "mark": "KUG"
        },
        {
          "date": "2026-07-20",
          "mark": "IQA"
        },
        {
          "date": "2026-07-24",
          "mark": "Out"
        },
        {
          "date": "2026-08-23",
          "mark": "IQA"
        },
        {
          "date": "2026-08-26",
          "mark": "POND"
        },
        {
          "date": "2026-09-26",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-04-20",
          "out": "2026-05-18",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "KUG",
          "sites": [
            "KUG",
            "IQA"
          ],
          "from": "2026-06-02",
          "out": "2026-07-24",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA",
            "POND"
          ],
          "from": "2026-08-23",
          "out": "2026-09-26",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [
        "OUT typed on 2026-07-25 while already off site",
        "shaded 2026-10-03 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ],
      "fullName": "Sam Manniapik",
      "flights": [
        {
          "arriveIqa": "2026-01-03",
          "arriveRef": "ORBPHB",
          "departIqa": "2026-02-14",
          "departRef": "YBDHEN",
          "camp": "Confirmed",
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-02-28",
          "arriveRef": "YBDHEN",
          "departIqa": "2026-03-30",
          "departRef": "EXOAOZ",
          "camp": "Confirmed",
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-04-27",
          "arriveRef": "YBDHEN",
          "departIqa": "2026-05-18",
          "departRef": "DJPXUN",
          "camp": "Confirmed",
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-06-03",
          "arriveRef": "QVJXLF",
          "departIqa": null,
          "departRef": null,
          "camp": "Confirmed",
          "carService": null,
          "note": null
        }
      ],
      "agreementSigned": false
    },
    {
      "id": "elmer-gosse-operator-truck-driver",
      "name": "Elmer Gosse",
      "role": "Operator/Truck Driver",
      "sheetRow": 14,
      "active": true,
      "homeSites": [
        "KUG",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-05-31",
          "mark": "YK"
        },
        {
          "date": "2026-06-01",
          "mark": "KUG"
        },
        {
          "date": "2026-07-20",
          "mark": "Out"
        },
        {
          "date": "2026-08-15",
          "mark": "IQA"
        },
        {
          "date": "2026-08-17",
          "mark": "POND"
        },
        {
          "date": "2026-09-26",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "KUG",
          "sites": [
            "KUG"
          ],
          "from": "2026-06-01",
          "out": "2026-07-20",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA",
            "POND"
          ],
          "from": "2026-08-15",
          "out": "2026-09-26",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [],
      "fullName": "Elmer Gosse",
      "flights": [
        {
          "arriveIqa": "2026-05-31",
          "arriveRef": "LSEVOY",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        }
      ]
    },
    {
      "id": "stacey-turner-operator-truck-driver",
      "name": "Stacey Turner",
      "role": "Operator/Truck Driver",
      "sheetRow": 15,
      "active": true,
      "homeSites": [
        "KUG",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-06-08",
          "mark": "KUG"
        },
        {
          "date": "2026-07-20",
          "mark": "Out"
        },
        {
          "date": "2026-08-04",
          "mark": "via KUG"
        },
        {
          "date": "2026-08-05",
          "mark": "KUG"
        },
        {
          "date": "2026-08-17",
          "mark": "YK"
        },
        {
          "date": "2026-08-19",
          "mark": "IQA"
        },
        {
          "date": "2026-08-22",
          "mark": "POND"
        },
        {
          "date": "2026-09-10",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "KUG",
          "sites": [
            "KUG"
          ],
          "from": "2026-06-08",
          "out": "2026-07-20",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "KUG",
          "sites": [
            "KUG",
            "IQA",
            "POND"
          ],
          "from": "2026-08-05",
          "out": "2026-09-10",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [
        "shaded 2026-09-12 to 2026-09-30 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ],
      "fullName": "Stacey Turner",
      "flights": [
        {
          "arriveIqa": "2026-06-09",
          "arriveRef": "OPKAHU",
          "departIqa": null,
          "departRef": null,
          "camp": "Confirmed",
          "carService": null,
          "note": null
        }
      ]
    },
    {
      "id": "stephen-turner-operator-truck-driver",
      "name": "Stephen Turner",
      "role": "Operator/Truck Driver",
      "sheetRow": 16,
      "active": true,
      "homeSites": [
        "KUG",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-06-08",
          "mark": "KUG"
        },
        {
          "date": "2026-07-20",
          "mark": "Out"
        },
        {
          "date": "2026-08-04",
          "mark": "via KUG"
        },
        {
          "date": "2026-08-05",
          "mark": "KUG"
        },
        {
          "date": "2026-08-17",
          "mark": "YK"
        },
        {
          "date": "2026-08-19",
          "mark": "IQA"
        },
        {
          "date": "2026-08-22",
          "mark": "POND"
        },
        {
          "date": "2026-09-10",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "KUG",
          "sites": [
            "KUG"
          ],
          "from": "2026-06-08",
          "out": "2026-07-20",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "KUG",
          "sites": [
            "KUG",
            "IQA",
            "POND"
          ],
          "from": "2026-08-05",
          "out": "2026-09-10",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [
        "shaded 2026-09-12 to 2026-09-30 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ],
      "fullName": "Stephen Turner",
      "flights": [
        {
          "arriveIqa": "2026-06-09",
          "arriveRef": "OPKAHU",
          "departIqa": null,
          "departRef": null,
          "camp": "Confirmed",
          "carService": null,
          "note": null
        }
      ]
    },
    {
      "id": "trevor-anstey-operator-truck-driver",
      "name": "Trevor Anstey",
      "role": "Operator/Truck Driver",
      "sheetRow": 17,
      "active": true,
      "homeSites": [
        "KUG",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-05-31",
          "mark": "YK"
        },
        {
          "date": "2026-06-01",
          "mark": "KUG"
        },
        {
          "date": "2026-07-20",
          "mark": "Out"
        },
        {
          "date": "2026-08-04",
          "mark": "via KUG"
        },
        {
          "date": "2026-08-05",
          "mark": "KUG"
        },
        {
          "date": "2026-08-17",
          "mark": "YK"
        },
        {
          "date": "2026-08-19",
          "mark": "IQA"
        },
        {
          "date": "2026-08-21",
          "mark": "POND"
        },
        {
          "date": "2026-09-12",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "KUG",
          "sites": [
            "KUG"
          ],
          "from": "2026-06-01",
          "out": "2026-07-20",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "KUG",
          "sites": [
            "KUG",
            "IQA",
            "POND"
          ],
          "from": "2026-08-05",
          "out": "2026-09-12",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [
        "shaded 2026-09-24 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ],
      "fullName": "Trevor Anstey",
      "flights": [
        {
          "arriveIqa": "2026-05-31",
          "arriveRef": "JNBGES",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        }
      ]
    },
    {
      "id": "thomas-gemtec-operator-truck-driver",
      "name": "Thomas (Gemtec)",
      "role": "Operator/Truck Driver",
      "category": "Subcontractor",
      "sheetRow": 18,
      "active": true,
      "homeSites": [
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-07-14",
          "mark": "Out"
        }
      ],
      "stints": [],
      "warnings": [
        "OUT typed on 2026-09-25 while already off site",
        "shaded 2026-08-28 to 2026-09-24 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ]
    },
    {
      "id": "carson-gemtec-operator-truck-driver",
      "name": "Carson (Gemtec)",
      "role": "Operator/Truck Driver",
      "category": "Subcontractor",
      "sheetRow": 19,
      "active": true,
      "homeSites": [
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [],
      "stints": [],
      "warnings": [
        "shaded 2026-09-25 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ]
    },
    {
      "id": "rob-operator-truck-driver",
      "name": "Robert French",
      "role": "Operator/Truck Driver",
      "sheetRow": 20,
      "active": true,
      "homeSites": [
        "IQA",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-05-05",
          "mark": "IQA"
        },
        {
          "date": "2026-07-26",
          "mark": "Out"
        },
        {
          "date": "2026-08-10",
          "mark": "IQA"
        },
        {
          "date": "2026-08-26",
          "mark": "POND"
        },
        {
          "date": "2026-11-01",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-05-05",
          "out": "2026-07-26",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA",
            "POND"
          ],
          "from": "2026-08-10",
          "out": "2026-11-01",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": [
        "14 unshaded days (2026-06-17) inside a stint that only ends with OUT on 2026-07-26 - check whether they went home in between"
      ],
      "fullName": "Robert French",
      "flights": [
        {
          "arriveIqa": "2025-12-16",
          "arriveRef": "OWGICU",
          "departIqa": "2026-01-12",
          "departRef": "URPHFI",
          "camp": "Confirmed",
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-02-16",
          "arriveRef": "DLIAEC",
          "departIqa": "2026-03-02",
          "departRef": "DLIAEC",
          "camp": "Confirmed",
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-05-05",
          "arriveRef": "HYFFLA",
          "departIqa": null,
          "departRef": null,
          "camp": "Confirmed",
          "carService": null,
          "note": null
        }
      ],
      "agreementSigned": true
    },
    {
      "id": "dean-melvin-operator-truck-driver",
      "name": "Dean Melvin",
      "role": "Operator/Truck Driver",
      "sheetRow": 21,
      "active": true,
      "homeSites": [
        "IQA",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-04-13",
          "mark": "Out"
        },
        {
          "date": "2026-04-27",
          "mark": "IQA"
        },
        {
          "date": "2026-06-08",
          "mark": "Out"
        },
        {
          "date": "2026-06-22",
          "mark": "IQA"
        },
        {
          "date": "2026-08-17",
          "mark": "Out"
        },
        {
          "date": "2026-08-31",
          "mark": "IQA"
        },
        {
          "date": "2026-09-25",
          "mark": "POND"
        },
        {
          "date": "2026-10-11",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-04-27",
          "out": "2026-06-08",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-06-22",
          "out": "2026-08-17",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA",
            "POND"
          ],
          "from": "2026-08-31",
          "out": "2026-10-11",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": [],
      "fullName": "Dean Melvin",
      "flights": [
        {
          "arriveIqa": "2026-02-14",
          "arriveRef": "GMKJYE",
          "departIqa": "2026-04-13",
          "departRef": "LOVTFN",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-04-27",
          "arriveRef": "LOVTFN",
          "departIqa": "2026-06-08",
          "departRef": "LVBSVW",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-06-22",
          "arriveRef": "LVBSVW",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        }
      ],
      "agreementSigned": true
    },
    {
      "id": "louis-labourer",
      "name": "Louis Coloumbe",
      "role": "Labourer",
      "sheetRow": 23,
      "active": true,
      "homeSites": [
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-04-01",
          "mark": "Out"
        },
        {
          "date": "2026-06-10",
          "mark": "IQA"
        },
        {
          "date": "2026-10-10",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-06-10",
          "out": "2026-10-10",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [],
      "fullName": "Louis Coloumbe",
      "flights": [
        {
          "arriveIqa": "2025-12-01",
          "arriveRef": "YBWVRS",
          "departIqa": "2026-04-01",
          "departRef": "LFTWTK",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-06-10",
          "arriveRef": "WSGANS",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        }
      ],
      "agreementSigned": false
    },
    {
      "id": "jf-labourer",
      "name": "Jean Francois Marsolais",
      "role": "Labourer",
      "sheetRow": 24,
      "active": true,
      "homeSites": [
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-05-12",
          "mark": "IQA"
        },
        {
          "date": "2026-07-02",
          "mark": "Out"
        },
        {
          "date": "2026-08-12",
          "mark": "IQA"
        },
        {
          "date": "2026-10-05",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-05-12",
          "out": "2026-07-02",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-08-12",
          "out": "2026-10-05",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [],
      "fullName": "Jean Francois Marsolais",
      "flights": [
        {
          "arriveIqa": "2026-05-12",
          "arriveRef": "LXCISS",
          "departIqa": "2026-07-02",
          "departRef": "MIOWBG",
          "camp": "Confirmed",
          "carService": "Confirmed",
          "note": null
        }
      ],
      "agreementSigned": false
    },
    {
      "id": "bernie-labourer",
      "name": "Bernie",
      "role": "Labourer",
      "sheetRow": 25,
      "active": true,
      "homeSites": [
        "ALRT",
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-04-27",
          "mark": "IQA"
        },
        {
          "date": "2026-06-25",
          "mark": "Out"
        },
        {
          "date": "2026-07-13",
          "mark": "via ALRT"
        },
        {
          "date": "2026-07-14",
          "mark": "ALRT"
        },
        {
          "date": "2026-08-18",
          "mark": "Out"
        },
        {
          "date": "2026-08-30",
          "mark": "IQA"
        },
        {
          "date": "2026-10-11",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-04-27",
          "out": "2026-06-25",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "ALRT",
          "sites": [
            "ALRT"
          ],
          "from": "2026-07-14",
          "out": "2026-08-18",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-08-30",
          "out": "2026-10-11",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": [],
      "fullName": "Bernard Coutu",
      "flights": [
        {
          "arriveIqa": "2026-04-27",
          "arriveRef": "NDFLGY",
          "departIqa": "2026-06-25",
          "departRef": "KCAKBT",
          "camp": "Confirmed",
          "carService": null,
          "note": null
        }
      ],
      "agreementSigned": false
    },
    {
      "id": "javi-labourer",
      "name": "Javier Humberto Castano Bedoya",
      "role": "Labourer",
      "sheetRow": 26,
      "active": true,
      "homeSites": [
        "ALRT",
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-05-01",
          "mark": "IQA"
        },
        {
          "date": "2026-06-25",
          "mark": "Out"
        },
        {
          "date": "2026-07-13",
          "mark": "via ALRT"
        },
        {
          "date": "2026-07-14",
          "mark": "ALRT"
        },
        {
          "date": "2026-08-18",
          "mark": "Out"
        },
        {
          "date": "2026-08-31",
          "mark": "IQA"
        },
        {
          "date": "2026-10-11",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-05-01",
          "out": "2026-06-25",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "ALRT",
          "sites": [
            "ALRT"
          ],
          "from": "2026-07-14",
          "out": "2026-08-18",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-08-31",
          "out": "2026-10-11",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": [],
      "fullName": "Javier Castano",
      "flights": [
        {
          "arriveIqa": "2026-05-01",
          "arriveRef": "CIOYTA",
          "departIqa": "2026-06-25",
          "departRef": "DXWIHJ",
          "camp": "Confirmed",
          "carService": null,
          "note": "car not needed"
        }
      ],
      "agreementSigned": true
    },
    {
      "id": "nicholas-labourer",
      "name": "Nicholas",
      "role": "Labourer",
      "sheetRow": 27,
      "active": true,
      "homeSites": [
        "ALRT",
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-06-15",
          "mark": "IQA"
        },
        {
          "date": "2026-07-07",
          "mark": "Out"
        },
        {
          "date": "2026-07-13",
          "mark": "via ALRT"
        },
        {
          "date": "2026-07-14",
          "mark": "ALRT"
        },
        {
          "date": "2026-08-21",
          "mark": "Out"
        },
        {
          "date": "2026-08-31",
          "mark": "IQA"
        },
        {
          "date": "2026-10-11",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-06-15",
          "out": "2026-07-07",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "ALRT",
          "sites": [
            "ALRT"
          ],
          "from": "2026-07-14",
          "out": "2026-08-21",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-08-31",
          "out": "2026-10-11",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": [],
      "fullName": "Nicholas Arvanis",
      "flights": [
        {
          "arriveIqa": "2026-06-15",
          "arriveRef": "IPBRLV",
          "departIqa": "2026-07-07",
          "departRef": "JSSITZ",
          "camp": "Confirmed",
          "carService": "Confirmed",
          "note": null
        }
      ]
    },
    {
      "id": "marjorie-labourer",
      "name": "Marjorie",
      "role": "Labourer",
      "sheetRow": 28,
      "active": true,
      "homeSites": [
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-06-06",
          "mark": "IQA"
        },
        {
          "date": "2026-08-25",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-06-06",
          "out": "2026-08-25",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [
        "unreadable mark 'Close CAMP' on 2026-11-01",
        "50 unshaded days (2026-06-07) inside a stint that only ends with OUT on 2026-08-25 - check whether they went home in between",
        "shaded 2026-09-14 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ]
    },
    {
      "id": "shakira-labourer",
      "name": "Shakira",
      "role": "Labourer",
      "category": "Local",
      "sheetRow": 29,
      "active": true,
      "homeSites": [
        "KUG",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-09-01",
          "mark": "POND"
        },
        {
          "date": "2026-09-02",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "POND",
          "sites": [
            "POND"
          ],
          "from": "2026-09-01",
          "out": "2026-09-02",
          "arrival": "marked",
          "departure": "travel-cell",
          "tentative": false
        }
      ],
      "warnings": [
        "shaded 2026-08-24 to 2026-08-31 with no IN/OUT typed - not counted as on site until the travel days are typed",
        "shaded 2026-09-03 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ]
    },
    {
      "id": "brad-rubia-labourer",
      "name": "Brad Rubia",
      "role": "Labourer",
      "sheetRow": 30,
      "active": true,
      "homeSites": [
        "KUG",
        "POND"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-08-04",
          "mark": "via KUG"
        },
        {
          "date": "2026-08-05",
          "mark": "KUG"
        },
        {
          "date": "2026-08-17",
          "mark": "YEG"
        },
        {
          "date": "2026-08-19",
          "mark": "IQA"
        },
        {
          "date": "2026-08-21",
          "mark": "POND"
        },
        {
          "date": "2026-11-01",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "KUG",
          "sites": [
            "KUG",
            "IQA",
            "POND"
          ],
          "from": "2026-08-05",
          "out": "2026-11-01",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": []
    },
    {
      "id": "kevin-barrieau-labourer",
      "name": "Kevin Barrieau",
      "role": "Labourer",
      "sheetRow": 31,
      "active": true,
      "homeSites": [
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [],
      "stints": [],
      "warnings": [
        "shaded 2026-08-01 to 2026-10-10 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ]
    },
    {
      "id": "natanael-lachance-labourer",
      "name": "Natanael Lachance",
      "role": "Labourer",
      "sheetRow": 32,
      "active": true,
      "homeSites": [
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-10-16",
          "mark": "IQA"
        },
        {
          "date": "2026-10-24",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-10-16",
          "out": "2026-10-24",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [
        "shaded 2026-08-01 to 2026-08-26 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ]
    },
    {
      "id": "marc-olivier-labourer",
      "name": "Marc Olivier",
      "role": "Labourer",
      "sheetRow": 33,
      "active": true,
      "homeSites": [
        "IQA"
      ],
      "projectIds": [],
      "inDate": null,
      "outDate": null,
      "rotationDays": 42,
      "events": [
        {
          "date": "2026-10-16",
          "mark": "IQA"
        },
        {
          "date": "2026-10-24",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-10-16",
          "out": "2026-10-24",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [
        "shaded 2026-08-01 to 2026-08-26 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ]
    },
    {
      "id": "shannon-mechanic",
      "name": "Shannon King",
      "role": "Mechanic",
      "sheetRow": 35,
      "active": true,
      "homeSites": [
        "IQA"
      ],
      "projectIds": [],
      "inDate": "2026-05-25",
      "outDate": "2026-06-22",
      "rotationDays": 28,
      "events": [
        {
          "date": "2026-05-09",
          "mark": "Out"
        },
        {
          "date": "2026-05-25",
          "mark": "IQA"
        },
        {
          "date": "2026-06-02",
          "mark": "KUG"
        },
        {
          "date": "2026-06-23",
          "mark": "via KUG"
        },
        {
          "date": "2026-06-24",
          "mark": "IQA"
        },
        {
          "date": "2026-08-26",
          "mark": "YK"
        },
        {
          "date": "2026-08-27",
          "mark": "KUG"
        },
        {
          "date": "2026-09-01",
          "mark": "Out"
        },
        {
          "date": "2026-09-22",
          "mark": "IQA"
        },
        {
          "date": "2026-10-08",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "IQA",
          "sites": [
            "IQA",
            "KUG",
            "IQA",
            "KUG"
          ],
          "from": "2026-05-25",
          "out": "2026-09-01",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "IQA",
          "sites": [
            "IQA"
          ],
          "from": "2026-09-22",
          "out": "2026-10-08",
          "arrival": "marked",
          "departure": "shading-ended",
          "tentative": false
        }
      ],
      "warnings": [
        "shaded 2026-09-14 to 2026-09-21 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ],
      "fullName": "Shannon King",
      "flights": [
        {
          "arriveIqa": "2026-01-05",
          "arriveRef": "WIVYMZ",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-01-06",
          "arriveRef": "OZLTCB",
          "departIqa": "2026-03-02",
          "departRef": "YOHGWV",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-03-16",
          "arriveRef": "YOHGWV",
          "departIqa": "2026-05-09",
          "departRef": "CFAQZV",
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-05-25",
          "arriveRef": "CFAQZV",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-06-01",
          "arriveRef": "FLPDJD",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        },
        {
          "arriveIqa": "2026-06-01",
          "arriveRef": "YNWRRI",
          "departIqa": null,
          "departRef": null,
          "camp": null,
          "carService": null,
          "note": null
        }
      ],
      "agreementSigned": false
    },
    {
      "id": "mike-reid-mechanic",
      "name": "Mike Reid",
      "role": "Mechanic",
      "sheetRow": 36,
      "active": true,
      "homeSites": [
        "KUG",
        "POND"
      ],
      "projectIds": [],
      "inDate": "2026-06-19",
      "outDate": null,
      "rotationDays": 28,
      "events": [
        {
          "date": "2026-06-19",
          "mark": "via KUG"
        },
        {
          "date": "2026-06-20",
          "mark": "KUG"
        },
        {
          "date": "2026-07-20",
          "mark": "Out"
        },
        {
          "date": "2026-08-04",
          "mark": "via KUG"
        },
        {
          "date": "2026-08-05",
          "mark": "KUG"
        },
        {
          "date": "2026-08-17",
          "mark": "YK"
        },
        {
          "date": "2026-08-21",
          "mark": "POND"
        },
        {
          "date": "2026-09-14",
          "mark": "Out"
        }
      ],
      "stints": [
        {
          "site": "KUG",
          "sites": [
            "KUG"
          ],
          "from": "2026-06-20",
          "out": "2026-07-20",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        },
        {
          "site": "KUG",
          "sites": [
            "KUG",
            "POND"
          ],
          "from": "2026-08-05",
          "out": "2026-09-14",
          "arrival": "marked",
          "departure": "marked",
          "tentative": false
        }
      ],
      "warnings": [
        "shaded 2026-09-22 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed"
      ]
    }
  ],
  "housingCrew": null,
  "staffing": [],
  "dayNotes": [
    {
      "date": "2026-08-16",
      "text": "IQA Arrival - Lateral for Pond"
    },
    {
      "date": "2026-08-18",
      "text": "POND Arrival (South bound cargo)"
    }
  ],
  "warnings": [
    "Eric Jacobsen: OUT typed on 2026-06-04 while already off site",
    "Eric Jacobsen: shaded 2026-08-29 to 2026-09-22 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "William Matthews: shaded 2026-09-13 to 2026-09-21 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Kirk: unreadable mark 'Book' on 2026-10-10",
    "Sam M: OUT typed on 2026-07-25 while already off site",
    "Sam M: shaded 2026-10-03 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Stacey Turner: shaded 2026-09-12 to 2026-09-30 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Stephen Turner: shaded 2026-09-12 to 2026-09-30 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Trevor Anstey: shaded 2026-09-24 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Thomas (Gemtec): OUT typed on 2026-09-25 while already off site",
    "Thomas (Gemtec): shaded 2026-08-28 to 2026-09-24 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Carson (Gemtec): shaded 2026-09-25 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Rob: 14 unshaded days (2026-06-17) inside a stint that only ends with OUT on 2026-07-26 - check whether they went home in between",
    "Marjorie: unreadable mark 'Close CAMP' on 2026-11-01",
    "Marjorie: 50 unshaded days (2026-06-07) inside a stint that only ends with OUT on 2026-08-25 - check whether they went home in between",
    "Marjorie: shaded 2026-09-14 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Shakira: shaded 2026-08-24 to 2026-08-31 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Shakira: shaded 2026-09-03 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Kevin Barrieau: shaded 2026-08-01 to 2026-10-10 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Natanael Lachance: shaded 2026-08-01 to 2026-08-26 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Marc Olivier: shaded 2026-08-01 to 2026-08-26 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Shannon: shaded 2026-09-14 to 2026-09-21 with no IN/OUT typed - not counted as on site until the travel days are typed",
    "Mike Reid: shaded 2026-09-22 to 2026-10-31 with no IN/OUT typed - not counted as on site until the travel days are typed"
  ],
  "stats": {
    "people": 29,
    "activePeople": 29,
    "projects": 0,
    "datedColumns": 389,
    "bridgedColumns": [
      "2026-07-28"
    ],
    "dateSpan": [
      "2025-12-08",
      "2026-12-31"
    ],
    "markValues": {
      "Out": 60,
      "IQA": 40,
      "KUG": 15,
      "POND": 14,
      "YK": 8,
      "via KUG": 7,
      "ALRT": 5,
      "via ALRT": 4,
      "via IQA": 2,
      "YF": 1,
      "YEG": 1
    },
    "flightNamesNotOnSchedule": [
      "AKZIZ ABDENOUR (MEQUALTECH)",
      "CHRISTIAN LAPOINTE",
      "JAGAR SHABAGA",
      "JOSEPH FINDLAY",
      "NATHANAEL LACHANCE",
      "STEVE TESSIER",
      "VISHAL MAHI (GEMTEC)"
    ]
  }
} as const;
