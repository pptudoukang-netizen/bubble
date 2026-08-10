"use strict";

module.exports = {
  cycleLength: 7,
  resetMode: "loop_after_day_7",
  missedDayPolicy: "keep_progress",
  autoPopupOnFirstLogin: true,
  autoPopupUserDefault: true,
  rewards: [
    {
      day: 1,
      items: [
        { id: "coin", count: 100 }
      ]
    },
    {
      day: 2,
      items: [
        { id: "swap_ball", count: 1 }
      ]
    },
    {
      day: 3,
      items: [
        { id: "coin", count: 150 },
        { id: "rainbow_ball", count: 1 }
      ]
    },
    {
      day: 4,
      items: [
        { id: "gem", count: 10 },
        { id: "barrier_hammer", count: 1 }
      ]
    },
    {
      day: 5,
      items: [
        { id: "coin", count: 200 },
        { id: "blast_ball", count: 1 }
      ]
    },
    {
      day: 6,
      items: [
        { id: "swap_ball", count: 1 },
        { id: "rainbow_ball", count: 1 }
      ]
    },
    {
      day: 7,
      displayItem: { id: "gift_pack", count: 1 },
      items: [
        { id: "blast_ball", count: 2 },
        { id: "rainbow_ball", count: 2 },
        { id: "coin", count: 1000 }
      ]
    }
  ]
};
