/**
 * Tailwind class tokens shared by the Plan Canvas and the administration
 * dialogs that use its form language. Keeping them here means the plan UI has
 * no dedicated stylesheet while the dialogs stay visually consistent.
 */

export const eyebrow =
  "flex items-center gap-2 text-muted text-[9px] font-bold tracking-[0.145em] uppercase";

export const eyebrowDot =
  "h-[5px] w-[5px] rounded-full bg-[#3c7a55] shadow-[0_0_0_3px_rgba(60,122,85,0.1)]";

const dialogFrame =
  "relative w-[min(var(--plan-dialog-w,500px),100%)] p-6 overflow-y-auto border border-[rgba(255,255,255,0.38)] rounded-2xl bg-paper-strong shadow-[0_30px_80px_rgba(12,20,16,0.36)] animate-[dialog-in_200ms_ease_both] max-[560px]:p-5 [&_h2]:mt-2.5 [&_h2]:mr-[38px] [&_h2]:mb-2 [&_h2]:text-ink [&_h2]:font-serif [&_h2]:text-[30px] [&_h2]:font-normal [&_h2]:tracking-[-0.018em] [&_h2]:leading-[1.03] max-[560px]:[&_h2]:text-[26px] [&_.dialog-lede]:max-w-[520px] [&_.dialog-lede]:mb-4";

export const dialog = `${dialogFrame} max-h-[calc(100svh-40px)]`;

export const dialogTall = `${dialogFrame} max-h-[min(88vh,780px)]`;

/** Sets the dialog width token; combine with `dialog`/`dialogTall`. */
export const dialogWide = "[--plan-dialog-w:640px]";

export const dialogMedium = "[--plan-dialog-w:620px]";

export const dialogField =
  "flex flex-col gap-1.5 mb-3 [&>span]:text-muted [&>span]:text-[8.5px] [&>span]:font-bold [&>span]:tracking-[0.09em] [&>span]:uppercase [&_input:not([type=checkbox]):not([type=radio])]:h-[43px] [&_input:not([type=checkbox]):not([type=radio])]:px-[11px] [&_input:not([type=checkbox]):not([type=radio])]:border [&_input:not([type=checkbox]):not([type=radio])]:border-line-strong [&_input:not([type=checkbox]):not([type=radio])]:rounded-[9px] [&_input:not([type=checkbox]):not([type=radio])]:outline-none [&_input:not([type=checkbox]):not([type=radio])]:bg-paper [&_input:not([type=checkbox]):not([type=radio])]:text-ink [&_input:not([type=checkbox]):not([type=radio])]:text-xs [&_input:not([type=checkbox]):not([type=radio])]:transition-[border-color,box-shadow,background] [&_input:not([type=checkbox]):not([type=radio])]:duration-150 [&_input:not([type=checkbox]):not([type=radio]):focus]:border-green [&_input:not([type=checkbox]):not([type=radio]):focus]:bg-[#fffefb] [&_input:not([type=checkbox]):not([type=radio]):focus]:shadow-[0_0_0_3px_rgba(45,91,66,0.1)] [&_select]:h-[43px] [&_select]:px-[11px] [&_select]:border [&_select]:border-line-strong [&_select]:rounded-[9px] [&_select]:outline-none [&_select]:bg-paper [&_select]:text-ink [&_select]:text-xs [&_select]:cursor-pointer [&_select]:transition-[border-color,box-shadow,background] [&_select]:duration-150 [&_select:focus]:border-green [&_select:focus]:bg-[#fffefb] [&_select:focus]:shadow-[0_0_0_3px_rgba(45,91,66,0.1)]";

export const dialogGrid =
  "grid grid-cols-2 gap-x-2.5 gap-y-0 max-[780px]:grid-cols-1";

export const dialogFull = "col-[1_/_-1]";

export const dialogPreview =
  "grid grid-cols-3 gap-[7px] px-[11px] py-2.5 border border-line rounded-[9px] bg-paper max-[560px]:grid-cols-2 [&>div]:flex [&>div]:flex-col [&>div]:gap-0.5 [&_span]:text-faint [&_span]:text-[8px] [&_span]:font-bold [&_span]:tracking-[0.08em] [&_span]:uppercase [&_b]:text-[11px] [&_b]:font-semibold [&_b]:tabular-nums";

export const dialogActions =
  "flex items-center justify-end gap-2 mt-[18px] max-[560px]:flex-wrap max-[560px]:[&>button]:flex-1";

export const dialogSelection =
  "mr-auto text-muted text-[9.5px] font-semibold tabular-nums max-[560px]:mr-0 max-[560px]:w-full";

export const field =
  "flex flex-col gap-[5px] mb-[9px] [&>span]:text-muted [&>span]:text-[9.5px] [&>span]:font-medium [&_input:not([type=checkbox]):not([type=radio])]:h-[33px] [&_input:not([type=checkbox]):not([type=radio])]:px-2 [&_input:not([type=checkbox]):not([type=radio])]:border [&_input:not([type=checkbox]):not([type=radio])]:border-line-strong [&_input:not([type=checkbox]):not([type=radio])]:rounded-lg [&_input:not([type=checkbox]):not([type=radio])]:bg-paper-strong [&_input:not([type=checkbox]):not([type=radio])]:text-ink [&_input:not([type=checkbox]):not([type=radio])]:text-[10px] [&_input:not([type=checkbox]):not([type=radio]):focus]:border-green [&_input:not([type=checkbox]):not([type=radio]):focus]:outline-none [&_select]:h-[33px] [&_select]:px-2 [&_select]:border [&_select]:border-line-strong [&_select]:rounded-lg [&_select]:bg-paper-strong [&_select]:text-ink [&_select]:text-[10px] [&_select]:cursor-pointer [&_select:focus]:border-green [&_select:focus]:outline-none";

export const fieldLabel = "text-muted text-[9.5px] font-medium";

export const addressRow =
  "flex items-stretch gap-1.5 [&_input]:flex-1 [&_input]:w-auto [&_input]:min-w-0";

export const addressRowButton =
  "inline-flex flex-none items-center justify-center gap-[7px] h-[34px] px-[9px] border border-line-strong rounded-[9px] text-ink-soft text-[9px] font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background,border-color] duration-150 hover:not-disabled:bg-bone disabled:opacity-45 disabled:cursor-not-allowed";

export const addressHint = "mt-[3px] text-faint text-[8px] leading-[1.35]";

export const inspectorNote =
  "mt-[7px] text-faint text-[8.5px] leading-[1.45]";

export const inspectorNoteWarning =
  "mt-[7px] text-[#b45309] text-[8.5px] leading-[1.45]";

export const capacity = "flex flex-col gap-1.5";

export const capacityLabels =
  "flex items-baseline justify-between gap-2 text-muted text-[8.5px] [&>span:first-child]:text-ink [&>span:first-child]:text-[11px] [&>span:first-child]:font-semibold [&>span:first-child]:tabular-nums";

export const capacityTrack =
  "h-[5px] overflow-hidden rounded-full bg-bone-deep";

export const capacityTrackDialog =
  "h-1.5 overflow-hidden rounded-full bg-bone-deep";

export const capacityFill =
  "block h-full rounded-full transition-[width] duration-[240ms]";

export const capacityFillTone = {
  ok: "bg-[#4f8a66]",
  warn: "bg-[#c39338]",
  over: "bg-[#b8564a]",
} as const;

export const capacityNote =
  "flex items-center gap-[5px] mt-2 text-[9px] font-semibold leading-[1.35] [&_svg]:flex-none";

export const capacityNoteTone = {
  ok: "text-[#2c6a49]",
  warn: "text-[#7d5a24]",
  over: "text-danger",
} as const;

export const hotelFilters =
  "flex gap-[7px] mb-2 max-[560px]:flex-col";

export const hotelSearch =
  "flex flex-1 items-center gap-[7px] h-[38px] px-2.5 border border-line-strong rounded-[9px] bg-paper transition-[border-color,box-shadow,background] duration-150 focus-within:border-green focus-within:bg-[#fffefb] focus-within:shadow-[0_0_0_3px_rgba(45,91,66,0.1)] [&_svg]:flex-none [&_svg]:text-faint [&_input]:w-full [&_input]:border-0 [&_input]:outline-none [&_input]:bg-transparent [&_input]:text-[11.5px] [&_input::placeholder]:text-faint";

export const hotelFilterSelect =
  "w-[150px] px-2 border border-line-strong rounded-[9px] outline-none bg-paper text-ink text-[10px] cursor-pointer max-[560px]:w-full max-[560px]:h-[38px]";

export const hotelBulk =
  "flex items-center justify-between gap-2.5 mb-[5px] text-faint text-[8.5px] [&_button]:text-green [&_button]:text-[8.5px] [&_button]:font-bold [&_button:hover:not(:disabled)]:underline [&_button:disabled]:opacity-45";

export const hotelList =
  "flex flex-col gap-[3px] min-h-[120px] max-h-[270px] p-[5px] overflow-y-auto border border-line rounded-[9px] bg-paper overscroll-contain";

export const hotelListEmpty =
  "m-auto p-5 text-faint text-[10px] text-center";

const hotelOptionBase =
  "relative flex items-center gap-2 px-[7px] py-1.5 border rounded-[7px] cursor-pointer transition-[background,border-color] duration-100 focus-within:outline-2 focus-within:outline-green/25 focus-within:outline-offset-1";

export const hotelOption = `${hotelOptionBase} border-transparent hover:border-line hover:bg-paper-strong`;

export const hotelOptionSelected = `${hotelOptionBase} border-[#cfe0d3] bg-green-soft`;

const hotelOptionCheckBase =
  "grid flex-none w-4 h-4 place-items-center border rounded text-cream";

export const hotelOptionCheck = `${hotelOptionCheckBase} border-line-strong bg-paper-strong`;

export const hotelOptionCheckSelected = `${hotelOptionCheckBase} border-green bg-green`;

export const hotelOptionInput =
  "absolute w-px h-px opacity-0 pointer-events-none";

export const hotelOptionMain =
  "flex flex-1 flex-col gap-px min-w-0 [&_b]:overflow-hidden [&_b]:text-[10.5px] [&_b]:font-semibold [&_b]:text-ellipsis [&_b]:whitespace-nowrap [&>span]:flex [&>span]:items-center [&>span]:gap-1 [&>span]:overflow-hidden [&>span]:text-muted [&>span]:text-[8.5px] [&>span]:text-ellipsis [&>span]:whitespace-nowrap";

export const hotelOptionDot = "flex-none w-[5px] h-[5px] rounded-full";

export const hotelOptionBags =
  "flex-none text-muted text-[9px] tabular-nums";

export const dialogCapacity =
  "mt-3 px-3 py-[11px] border border-line rounded-[10px] bg-paper";

export const dialogDayLoads = "grid gap-2.5";

export const vehicleAdd =
  "grid grid-cols-[minmax(0,1fr)_132px_auto] gap-2.5 items-end mb-3 p-[11px] border border-line rounded-[10px] bg-paper max-[780px]:grid-cols-1 [&>label]:mb-0";

export const vehicleAddButton =
  "h-[43px]! whitespace-nowrap max-[780px]:w-full";

export const vehicleError =
  "flex items-center gap-[5px] m-0 mb-2.5 text-[#b91c1c] text-[9px]";

export const vehicleSummary =
  "flex gap-4 mb-2 text-muted text-[9px] [&_b]:text-ink [&_b]:font-bold";

export const vehicleList =
  "flex flex-col gap-[5px] max-h-[330px] p-0.5 overflow-y-auto overscroll-contain";

export const vehicleListEmpty =
  "m-0 p-5 text-faint text-[10px] text-center";

const vehicleBase =
  "flex flex-wrap items-center gap-[9px] px-2.5 py-2 border rounded-[9px]";

export const vehicle = `${vehicleBase} border-line bg-paper`;

export const vehicleEditing = `${vehicleBase} border-[#b7c7bb] bg-[#fffefb]`;

export const vehicleSwatch = "flex-none w-[7px] h-[28px] rounded-[4px]";

export const vehicleMain =
  "flex flex-1 flex-col gap-px min-w-0 [&_b]:overflow-hidden [&_b]:text-[11px] [&_b]:font-semibold [&_b]:text-ellipsis [&_b]:whitespace-nowrap [&_span]:overflow-hidden [&_span]:text-muted [&_span]:text-[8.5px] [&_span]:tabular-nums [&_span]:text-ellipsis [&_span]:whitespace-nowrap";

export const vehicleActions = "flex flex-none gap-0.5";

const vehicleIconBase =
  "grid w-[26px] h-[26px] place-items-center border border-transparent rounded-md transition-colors disabled:opacity-35 disabled:cursor-not-allowed";

export const vehicleIconButton = `${vehicleIconBase} text-muted hover:not-disabled:bg-bone hover:not-disabled:text-ink`;

export const vehicleIconSave = `${vehicleIconBase} text-green hover:not-disabled:bg-bone hover:not-disabled:text-ink`;

export const vehicleIconDanger = `${vehicleIconBase} text-muted hover:not-disabled:bg-[#fbeae6] hover:not-disabled:text-[#b91c1c]`;

export const vehicleEdit =
  "flex flex-1 items-center gap-1.5 min-w-0 [&_input]:h-[30px] [&_input]:min-w-0 [&_input]:px-2 [&_input]:border [&_input]:border-line-strong [&_input]:rounded-[7px] [&_input]:outline-none [&_input]:bg-paper-strong [&_input]:text-ink [&_input]:text-[10.5px] [&_input:first-child]:flex-1 [&_input[type=number]]:w-[78px] [&_input[type=number]]:flex-none [&_input:focus]:border-green [&_input:focus]:shadow-[0_0_0_3px_rgba(45,91,66,0.1)]";

export const vehicleWarning =
  "flex basis-full items-start gap-[5px] mt-0.5 ml-4 text-[#b45309] text-[8.5px] leading-[1.4]";

/* --------------------------------------------------------------------------
   Shared dialog chrome
   -------------------------------------------------------------------------- */

export const dialogBackdrop =
  "fixed inset-0 z-[200] grid place-items-center p-5 bg-[rgba(17,27,22,0.46)] animate-[fade-in_160ms_ease_both] backdrop-blur-[7px]";

export const dialogClose =
  "absolute top-[13px] right-[13px] grid w-7 h-7 place-items-center rounded-[7px] text-muted hover:bg-bone hover:text-ink";

export const dialogEyebrow =
  "flex items-center gap-1.5 text-muted text-[8.5px] font-bold tracking-[0.13em] uppercase";

export const dialogLede =
  "max-w-[368px] mb-[18px] text-muted text-[11.5px] leading-[1.55] max-[560px]:mb-[15px] max-[560px]:text-[11px]";

export const btnGhost =
  "inline-flex items-center justify-center gap-[7px] h-[37px] px-3.5 border border-line-strong rounded-[9px] text-[10.5px] font-semibold tracking-[-0.005em] text-ink-soft transition-[background,border-color] duration-150 hover:not-disabled:bg-bone disabled:opacity-45 disabled:cursor-not-allowed";

export const btnPrimary =
  "inline-flex items-center justify-center gap-[7px] h-[37px] px-3.5 border border-transparent rounded-[9px] bg-ink text-cream text-[10.5px] font-semibold tracking-[-0.005em] transition-[background,border-color] duration-150 hover:bg-[#273a2f] disabled:opacity-45 disabled:cursor-not-allowed";

export const formError =
  "flex items-start gap-[6px] mt-[10px] px-[10px] py-2 rounded-[7px] bg-[#fbeae6] text-[#b91c1c] text-[9px] font-semibold leading-[1.4] [&_svg]:flex-none [&_svg]:mt-px";

/* --------------------------------------------------------------------------
   Plan canvas shell
   -------------------------------------------------------------------------- */

export const workspace =
  "flex-1 grid [grid-template-areas:'sidebar_map_inspector'] grid-cols-[minmax(320px,376px)_minmax(0,1fr)_minmax(286px,330px)] min-h-0 max-[1240px]:grid-cols-[minmax(296px,336px)_minmax(0,1fr)_minmax(268px,300px)] max-[980px]:[grid-template-areas:'sidebar_map'] max-[980px]:grid-cols-[minmax(296px,336px)_minmax(0,1fr)] max-[780px]:[grid-template-areas:'map'_'sidebar'] max-[780px]:grid-rows-[minmax(0,42%)_minmax(0,1fr)] max-[780px]:grid-cols-[minmax(0,1fr)]";

/* --------------------------------------------------------------------------
   Route board (left rail)
   -------------------------------------------------------------------------- */

export const sidebar =
  "relative z-[3] flex [grid-area:sidebar] flex-col min-w-0 min-h-0 border-r border-line bg-paper max-[780px]:border-t max-[780px]:border-r-0";

export const switcher =
  "flex flex-none items-end gap-1.5 p-[9px_11px] border-b border-line bg-paper";

export const switcherPicker =
  "flex flex-1 flex-col gap-[3px] min-w-0 [&>span]:text-faint [&>span]:text-[7px] [&>span]:font-extrabold [&>span]:tracking-[0.1em] [&>span]:uppercase";

export const switcherSelect =
  "w-full h-[30px] min-w-0 px-[7px] border border-line rounded-[7px] outline-none bg-paper text-ink text-[9.5px] font-semibold focus:border-line-strong";

export const switcherSave =
  "inline-flex items-center gap-1 h-[30px] px-2 border border-line rounded-[7px] bg-paper text-ink-soft text-[8.5px] font-bold whitespace-nowrap transition-colors hover:bg-bone hover:text-ink";

export const sidebarHead =
  "flex flex-none items-start justify-between gap-2.5 px-[18px] pt-[18px] pb-[13px] border-b border-line max-[780px]:px-[15px] max-[780px]:pt-[13px] max-[780px]:pb-2.5";

export const sidebarTitle =
  "mt-[3px] font-serif text-[22px] font-normal leading-none tracking-[-0.01em] max-[780px]:text-[19px]";

export const sidebarHint =
  "inline-flex items-center gap-1 mt-[3px] text-faint text-[9px] font-medium whitespace-nowrap max-[780px]:hidden";

export const sidebarHeadTools =
  "flex flex-none flex-col items-end gap-[7px] max-[780px]:gap-[5px]";

export const sidebarHeadActions = "flex flex-wrap justify-end gap-1.5";

export const newRoute =
  "inline-flex items-center gap-1 h-[26px] px-[9px] rounded-[7px] bg-ink text-cream text-[9px] font-bold tracking-[-0.005em] whitespace-nowrap transition-colors hover:bg-[#273a2f] max-[780px]:h-6 max-[780px]:px-2";

export const newRouteGhost =
  "inline-flex items-center gap-1 h-[26px] px-[9px] border border-line-strong rounded-[7px] bg-paper text-ink-soft text-[9px] font-bold tracking-[-0.005em] whitespace-nowrap transition-colors hover:bg-bone max-[780px]:h-6 max-[780px]:px-2";

export const modeSwitchSidebar =
  "hidden flex-none gap-px p-0.5 border border-line rounded-lg bg-paper max-[780px]:flex";

export const modeButton =
  "inline-flex items-center gap-1 h-[22px] px-[7px] rounded-[5px] text-muted text-[8.5px] font-bold tracking-[0.01em] whitespace-nowrap transition-colors hover:text-ink";

export const modeButtonActive =
  "inline-flex items-center gap-1 h-[22px] px-[7px] rounded-[5px] bg-ink text-cream text-[8.5px] font-bold tracking-[0.01em] whitespace-nowrap";

export const dayFilter =
  "flex flex-none gap-0.5 mx-[11px] mb-[9px] p-[3px] border border-line rounded-lg bg-paper";

export const dayFilterButton =
  "flex flex-1 items-center justify-center gap-1 h-[27px] rounded-[5px] text-muted text-[8.5px] font-bold transition-colors hover:text-ink [&_b]:text-[7.5px] [&_b]:font-semibold [&_b]:opacity-[0.62]";

export const dayFilterButtonActive =
  "flex flex-1 items-center justify-center gap-1 h-[27px] rounded-[5px] bg-ink text-cream text-[8.5px] font-bold [&_b]:text-[7.5px] [&_b]:font-semibold [&_b]:opacity-90";

export const sidebarRoutes =
  "flex flex-1 flex-col gap-[9px] min-h-0 p-[11px] overflow-y-auto overscroll-contain max-[780px]:p-[9px]";

export const sidebarRoutesWarehouse =
  "flex flex-1 flex-col gap-[13px] min-h-0 p-[11px] overflow-y-auto overscroll-contain max-[780px]:p-[9px]";

export const sidebarFoot =
  "flex flex-none flex-col gap-[5px] px-4 py-2.5 border-t border-line text-faint text-[9px] [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 max-[780px]:hidden";

export const legendLine = "w-[18px] border-t-2 border-dashed border-[#b3bcb3]";

export const legendLineSolid = "w-[18px] border-t-2 border-solid border-green";

export const legendRegion =
  "w-[18px] h-[9px] border-[1.5px] border-[#111827] rounded-[2px] bg-[rgba(95,128,104,0.2)]";

export const warehouseHint = "px-1 text-faint text-[8.5px] leading-[1.45]";

/* --------------------------------------------------------------------------
   Route cards and stops
   -------------------------------------------------------------------------- */

const routeCardBase =
  "flex-none overflow-hidden rounded-xl bg-paper-strong transition-[border-color,box-shadow] duration-150 border";

export const routeCard = `${routeCardBase} border-line shadow-[0_1px_2px_rgba(24,36,30,0.03)]`;
export const routeCardSelected = `${routeCardBase} border-[#b7c7bb] shadow-[0_0_0_1px_rgba(45,91,66,0.08),0_7px_18px_rgba(24,36,30,0.06)]`;
export const routeCardDropTarget = `${routeCardBase} border-[#6f9b7d] shadow-[0_0_0_2px_rgba(111,155,125,0.16),0_8px_22px_rgba(24,36,30,0.08)]`;
export const routeCardDropBlocked = `${routeCardBase} border-[#d9a49a] shadow-[0_0_0_2px_rgba(180,76,54,0.1),0_8px_22px_rgba(24,36,30,0.05)]`;

export const routeHead =
  "flex items-center gap-2 w-full px-3 pt-[11px] pb-[7px] text-left";

export const routeDot =
  "flex-none w-[7px] h-[7px] rounded-full shadow-[0_0_0_3px_rgba(24,36,30,0.045)]";

export const routeTitle = "flex flex-1 flex-col gap-px min-w-0";

export const routeTitleName =
  "flex items-center gap-1 overflow-hidden text-[11.5px] font-semibold tracking-[-0.005em] whitespace-nowrap";

export const routeName =
  "overflow-hidden min-w-0 text-ellipsis whitespace-nowrap";

export const routeMeta =
  "overflow-hidden text-muted text-[9.5px] tabular-nums text-ellipsis whitespace-nowrap";

export const routeTag =
  "inline-flex flex-none items-center px-1 py-px rounded-[4px] bg-green-soft text-green text-[7.5px] font-bold tracking-[0.05em] uppercase align-[1px]";

export const routeDepotTag =
  "inline-flex flex-none items-center px-1 py-px rounded-[4px] bg-bone-deep text-muted text-[7.5px] font-bold tracking-[0.05em] uppercase align-[1px]";

export const routeDepotTagSecondary =
  "inline-flex flex-none items-center px-1 py-px rounded-[4px] bg-[#e0f2fe] text-[#0369a1] text-[7.5px] font-bold tracking-[0.05em] uppercase align-[1px]";

export const routeLaundryTag =
  "inline-flex flex-none items-center gap-[3px] px-1 py-px rounded-[4px] bg-[#f3e8ff] text-[#7e22ce] text-[7.5px] font-bold tracking-[0.05em] uppercase align-[1px]";

export const routeVehicleMissing =
  "inline-flex flex-none items-center px-1 py-px rounded-[4px] bg-[#fef3c7] text-[#92400e] text-[7.5px] font-bold tracking-[0.05em] uppercase whitespace-nowrap";

export const routeCapacityTrack =
  "h-[3px] mx-3 mb-2 overflow-hidden rounded-full bg-bone-deep";

const routeWarningBase =
  "flex items-center gap-[5px] mx-[9px] mb-[7px] px-[7px] py-[5px] border rounded-md text-[9px] font-semibold leading-[1.3] [&_svg]:flex-none";

export const routeWarningTone = {
  error: `${routeWarningBase} border-[#efd5cf] bg-[#faedea] text-danger`,
  warning: `${routeWarningBase} border-[#f0dfba] bg-[#fbf2df] text-[#7d5a24]`,
} as const;

export const routeStops = "flex flex-col px-[7px] pb-[7px] pt-px";

export const routeEmpty =
  "flex items-center gap-1.5 mx-[5px] mt-0.5 mb-[5px] p-[9px] border border-dashed border-line-strong rounded-lg text-faint text-[9.5px]";

const stopRowBase =
  "group/stop relative flex items-center gap-1.5 px-[5px] py-1 rounded-lg cursor-pointer transition-colors";

export const stopRow = `${stopRowBase} hover:bg-[rgba(240,235,221,0.62)]`;

export const stopRowSelected = `${stopRowBase} bg-green-soft`;
export const stopRowDragging = "opacity-[0.32]";

export const stopHandle =
  "grid flex-none w-[15px] h-[22px] place-items-center text-[#b6bdb4] cursor-grab touch-none active:cursor-grabbing group-hover/stop:text-muted";

export const stopNumber =
  "grid flex-none w-[19px] h-[19px] place-items-center rounded-full text-white text-[8.5px] font-bold tabular-nums";

export const stopMain = "flex flex-1 flex-col min-w-0";

export const stopName =
  "overflow-hidden text-[10.5px] font-semibold tracking-[-0.004em] text-ellipsis whitespace-nowrap";

export const stopActions =
  "flex flex-none gap-px opacity-0 transition-opacity group-hover/stop:opacity-100 group-focus-within/stop:opacity-100";

export const stopActionsVisible =
  "flex flex-none gap-px opacity-100 transition-opacity";

export const stopAction =
  "grid w-5 h-5 place-items-center rounded-[5px] text-muted hover:not-disabled:bg-paper-strong hover:not-disabled:text-ink disabled:opacity-25";

export const stopDay =
  "flex-none w-[78px] h-[22px] pl-[3px] pr-[18px] border border-line rounded-[5px] outline-none bg-paper text-muted text-[8px] font-bold cursor-pointer hover:border-line-strong hover:text-ink focus:border-line-strong focus:text-ink";

export const dropLine =
  "h-0.5 mx-2 my-px rounded-full bg-green shadow-[0_0_0_3px_rgba(45,91,66,0.1)]";

export const routeTools = "flex gap-1 mx-[9px] mb-[7px]";

const routeToolBase =
  "inline-flex flex-1 items-center justify-center gap-[3px] h-[25px] px-[5px] border rounded-md bg-paper text-[8px] font-bold whitespace-nowrap transition-[background,border-color] duration-100 disabled:opacity-45";

export const routeTool = `${routeToolBase} border-line text-ink-soft hover:not-disabled:border-line-strong hover:not-disabled:bg-bone`;

export const routeToolDanger = `${routeToolBase} border-line text-danger hover:not-disabled:border-line-strong hover:not-disabled:bg-bone`;

/* --------------------------------------------------------------------------
   Warehouse board
   -------------------------------------------------------------------------- */

export const warehouse =
  "flex flex-none flex-col gap-[7px] p-[9px] border border-line rounded-xl bg-paper-strong";

export const warehouseHead =
  "flex items-center gap-2 px-0.5 pt-px pb-[7px] border-b border-line";

const warehousePinBase =
  "grid flex-none w-[26px] h-[26px] place-items-center rounded-[7px]";

export const warehousePin = `${warehousePinBase} bg-[#e0f2fe] text-[#0369a1]`;

export const warehousePinPrimary = `${warehousePinBase} bg-[#fbf2df] text-[#8a6425]`;

export const warehouseTitle = "flex flex-1 flex-col gap-px min-w-0";

export const warehouseTitleText =
  "overflow-hidden text-[10.5px] font-bold tracking-[-0.005em] text-ellipsis whitespace-nowrap";

export const warehouseTitleMeta =
  "overflow-hidden text-muted text-[8.5px] tabular-nums text-ellipsis whitespace-nowrap";

export const warehouseTag =
  "flex-none px-[5px] py-0.5 rounded-[4px] bg-bone-deep text-muted text-[7.5px] font-extrabold tracking-[0.06em]";

export const warehouseRoutes = "flex flex-col gap-[5px]";

export const warehouseEmpty =
  "px-2 py-[11px] border border-dashed border-line-strong rounded-lg text-faint text-[9px] text-center";

const warehouseRouteBase =
  "flex items-center gap-[5px] px-[7px] py-1.5 border rounded-lg bg-paper transition-[border-color,background] duration-100 hover:border-line-strong hover:bg-paper-strong";

export const warehouseRoute = `${warehouseRouteBase} border-line`;

export const warehouseRouteSelected = `${warehouseRouteBase} border-[#b7c7bb] shadow-[0_0_0_1px_rgba(45,91,66,0.08)]`;

export const warehouseRouteMain =
  "flex flex-1 items-center gap-[7px] min-w-0 text-left";

export const warehouseRouteDot =
  "flex-none w-[7px] h-[7px] rounded-full shadow-[0_0_0_3px_rgba(24,36,30,0.045)]";

export const warehouseRouteBody = "flex flex-col gap-px min-w-0";

export const warehouseRouteName =
  "overflow-hidden text-[10px] font-semibold text-ellipsis whitespace-nowrap";

export const warehouseRouteMeta =
  "overflow-hidden text-muted text-[8px] tabular-nums text-ellipsis whitespace-nowrap";

export const warehouseRouteMove =
  "inline-flex flex-none items-center gap-[3px] h-[23px] px-1.5 border border-line-strong rounded-md bg-paper-strong text-ink-soft text-[8px] font-bold whitespace-nowrap transition-[background,border-color] duration-100 hover:border-[#b7c7bb] hover:bg-bone";

/* --------------------------------------------------------------------------
   Map stage
   -------------------------------------------------------------------------- */

export const mapStage =
  "relative flex-1 min-h-0 overflow-hidden bg-map-bg isolate [grid-area:map]";

export const mapOverlay =
  "absolute top-4 left-4 z-[5] flex max-w-[250px] flex-col gap-px px-[13px] py-2.5 border border-line-strong rounded-[10px] bg-[rgba(251,248,241,0.94)] shadow-[0_6px_20px_rgba(24,36,30,0.1)] backdrop-blur-[9px]";

export const mapOverlayKicker =
  "text-faint text-[7.5px] font-bold tracking-[0.14em] uppercase";

export const mapOverlayTitle =
  "overflow-hidden text-xs font-semibold tracking-[-0.01em] text-ellipsis whitespace-nowrap";

export const mapOverlayMeta = "text-muted text-[9px] tabular-nums";

export const mapCanvas = "absolute inset-0 bg-map-bg";

export const mapStatus =
  "absolute inset-0 z-[5] grid place-items-center bg-[rgba(245,242,235,0.7)] backdrop-blur-[2px]";

export const mapStatusCard =
  "flex flex-col gap-0.5 px-[18px] py-3.5 border border-line-strong rounded-[11px] bg-paper-strong shadow-[0_14px_34px_rgba(24,36,30,0.12)] text-center [&_b]:text-[11.5px] [&_span]:text-muted [&_span]:text-[9.5px]";

/* --------------------------------------------------------------------------
   Inspector (right rail)
   -------------------------------------------------------------------------- */

export const inspector =
  "relative flex [grid-area:inspector] flex-col min-w-0 min-h-0 overflow-y-auto border-l border-line bg-paper overscroll-contain max-[980px]:fixed max-[980px]:top-16 max-[980px]:right-0 max-[980px]:bottom-[38px] max-[980px]:z-20 max-[980px]:w-[min(340px,88vw)] max-[980px]:border-l-line-strong max-[980px]:shadow-[-18px_0_44px_rgba(24,36,30,0.18)] max-[980px]:transition-[transform,visibility] max-[980px]:duration-[220ms] max-[780px]:top-[58px]";

export const inspectorClosed =
  "max-[980px]:invisible max-[980px]:translate-x-[102%]";

export const inspectorOpenClass =
  "max-[980px]:visible max-[980px]:translate-x-0";

export const inspectorClose =
  "hidden max-[980px]:absolute max-[980px]:top-[11px] max-[980px]:right-[11px] max-[980px]:z-[2] max-[980px]:grid max-[980px]:w-[26px] max-[980px]:h-[26px] max-[980px]:place-items-center max-[980px]:border max-[980px]:border-line max-[980px]:rounded-md max-[980px]:bg-paper max-[980px]:text-muted max-[980px]:transition-colors max-[980px]:hover:bg-bone max-[980px]:hover:text-ink";

export const drawerScrim =
  "hidden max-[980px]:fixed max-[980px]:top-16 max-[980px]:right-0 max-[980px]:bottom-[38px] max-[980px]:left-0 max-[980px]:z-[15] max-[980px]:block max-[980px]:bg-[rgba(24,36,30,0.18)] max-[980px]:transition-opacity max-[980px]:duration-200 max-[980px]:backdrop-blur-[1px] max-[780px]:top-[58px]";

export const drawerScrimClosed =
  "max-[980px]:opacity-0 max-[980px]:pointer-events-none";

export const drawerScrimOpen =
  "max-[980px]:opacity-100 max-[980px]:pointer-events-auto";

export const inspectorHead =
  "flex-none px-5 pt-[19px] pb-[15px] border-b border-line max-[980px]:pr-11";

export const inspectorTitle =
  "mt-1.5 font-serif text-2xl font-normal leading-[1.08] tracking-[-0.015em]";

export const inspectorLede =
  "mt-1 text-muted text-[10.5px] leading-normal";

export const inspectorCode =
  "px-1 py-px rounded-[3px] bg-bone text-ink-soft font-mono text-[8.5px]";

export const inlineDot = "inline-block w-1.5 h-1.5 rounded-full";

export const metrics = "grid flex-none grid-cols-2 gap-px border-b border-line bg-line";

export const metric =
  "flex flex-col gap-px px-3.5 py-[9px] bg-paper [&_span]:text-faint [&_span]:text-[8px] [&_span]:font-bold [&_span]:tracking-[0.11em] [&_span]:uppercase [&_b]:text-[12.5px] [&_b]:font-semibold [&_b]:tabular-nums [&_b]:tracking-[-0.01em]";

export const inspectorSection =
  "flex-none px-5 py-[15px] border-b border-line [&_h3]:mb-[9px] [&_h3]:text-faint [&_h3]:text-[8px] [&_h3]:font-bold [&_h3]:tracking-[0.13em] [&_h3]:uppercase";

export const inspectorRow = "flex gap-1.5 mb-[9px]";

const inspectorButtonBase =
  "inline-flex items-center justify-center gap-[7px] border border-line-strong rounded-[9px] font-semibold tracking-[-0.005em] text-ink-soft transition-[background,border-color] duration-150 hover:not-disabled:bg-bone disabled:opacity-45 disabled:cursor-not-allowed";

export const inspectorRowButton = `${inspectorButtonBase} flex-1 h-[31px] px-[7px] text-[9.5px]`;
export const inspectorWideButton = `${inspectorButtonBase} w-full h-[33px] text-[9.5px]`;
export const inspectorDangerButton =
  "inline-flex items-center justify-center gap-[7px] w-full h-[33px] border border-line-strong rounded-[9px] text-danger text-[9.5px] font-semibold tracking-[-0.005em] transition-[background,border-color] duration-150 hover:not-disabled:border-[#e3bdb6] hover:not-disabled:bg-[#faedea] disabled:opacity-45 disabled:cursor-not-allowed";

export const issues = "flex flex-col gap-[5px]";

const issueBase =
  "flex items-start gap-1.5 px-2 py-1.5 border rounded-[7px] text-[9px] leading-[1.35] text-left transition-[filter] duration-100 hover:brightness-[0.98] [&_svg]:flex-none [&_svg]:mt-px";

export const issue = `${issueBase} border-[#f0dfba] bg-[#fbf2df] text-[#7d5a24]`;

export const issueError = `${issueBase} border-[#efd5cf] bg-[#faedea] text-danger`;

export const mutedText = "text-muted text-[9.5px] leading-normal";

export const inspectorEmpty =
  "px-5 py-6 [&_h2]:mt-1.5 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-normal [&_h2]:tracking-[-0.015em] [&_p]:mt-[5px] [&_p]:text-muted [&_p]:text-[10px] [&_p]:leading-normal";

export const inspectorHealth =
  "flex-none mt-auto px-5 pt-[13px] pb-[17px] border-t border-line bg-[rgba(240,235,221,0.42)]";

export const inspectorHealthHead =
  "flex items-baseline justify-between gap-2 mb-2 text-faint text-[8px] font-bold tracking-[0.11em] uppercase [&>span:last-child]:tracking-[0.02em] [&>span:last-child]:normal-case [&>span:last-child]:font-medium [&>span:last-child]:text-[8.5px]";

export const dayCompare = "grid grid-cols-2 gap-2.5 mt-0.5";

export const dayCard =
  "flex flex-col gap-[7px] p-[11px] border border-line rounded-[9px] bg-paper";

export const dayCardLabel =
  "text-muted text-[8.5px] font-extrabold tracking-[0.08em] uppercase";

export const dayCardStats =
  "flex flex-col gap-[5px] text-faint text-[9.5px] tabular-nums [&_b]:text-ink [&_b]:text-[11px] [&_b]:font-bold";

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */

const toastBase =
  "fixed bottom-[54px] left-1/2 z-[80] flex items-center gap-2 py-2 pr-[9px] pl-[13px] border rounded-[11px] text-cream text-[10.5px] -translate-x-1/2 animate-[plan-toast-in_180ms_ease-out] [&>span]:max-w-[320px] [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap [&_button]:inline-flex [&_button]:items-center [&_button]:gap-1 [&_button]:px-[7px] [&_button]:py-1 [&_button]:rounded-md [&_button]:text-[rgba(251,247,236,0.78)] [&_button]:text-[9.5px] [&_button]:font-semibold [&_button:hover:not(:disabled)]:bg-white/[0.09] [&_button:hover:not(:disabled)]:text-white [&_button:disabled]:opacity-40";

export const toast = `${toastBase} border-white/[0.08] bg-ink shadow-[0_14px_36px_rgba(24,36,30,0.3)]`;

export const toastError = `${toastBase} border-[rgba(255,173,156,0.35)] bg-[#5b241a] shadow-[0_14px_36px_rgba(70,24,16,0.38)] [&>span]:whitespace-normal`;

export const toastClose = "p-1!";
