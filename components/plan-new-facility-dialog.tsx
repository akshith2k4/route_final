"use client";

import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import type { FacilityInput } from "../lib/facilities";
import { cn } from "./ui/cn";
import {
  addressRow,
  addressRowButton,
  btnGhost,
  btnPrimary,
  dialog,
  dialogActions,
  dialogBackdrop,
  dialogClose,
  dialogFull,
  dialogGrid,
  dialogMedium,
  eyebrow,
  eyebrowDot,
  field,
  fieldLabel,
  formError,
} from "./ui/plan-styles";

type PlanNewFacilityDialogProps = {
  open: boolean;
  initialRole: "warehouse" | "laundry";
  selectedRouteName?: string;
  onClose: () => void;
  onAdd: (values: FacilityInput) => Promise<boolean>;
};

export default function PlanNewFacilityDialog({
  open,
  initialRole,
  selectedRouteName,
  onClose,
  onAdd,
}: PlanNewFacilityDialogProps) {
  const isWarehouse = initialRole === "warehouse";
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [serviceMins, setServiceMins] = useState("180");
  const [error, setError] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setShortName("");
    setAddress("");
    setLat("");
    setLon("");
    setServiceMins("180");
    setError(null);
    setGeocodeError(null);
    setGeocoding(false);
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const lookupCoordinates = async (): Promise<{
    lat: number;
    lon: number;
    formattedAddress: string;
  } | null> => {
    const query = address.trim();
    if (!query) {
      setGeocodeError("Enter an address first to find coordinates.");
      return null;
    }

    setGeocoding(true);
    setGeocodeError(null);
    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: query }),
      });
      const data = (await response.json().catch(() => null)) as
        | {
            result?: {
              latitude: number;
              longitude: number;
              formattedAddress: string;
            };
            error?: string;
          }
        | null;

      if (!response.ok || !data?.result) {
        setGeocodeError(
          data?.error ?? "Could not find coordinates for that address.",
        );
        return null;
      }

      setLat(String(data.result.latitude));
      setLon(String(data.result.longitude));
      setAddress(data.result.formattedAddress);
      return {
        lat: data.result.latitude,
        lon: data.result.longitude,
        formattedAddress: data.result.formattedAddress,
      };
    } catch {
      setGeocodeError("Could not reach the geocoding service.");
      return null;
    } finally {
      setGeocoding(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    let trimmedShortName = shortName.trim();
    if (!trimmedShortName) {
      trimmedShortName = trimmedName
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .join("")
        .toUpperCase()
        .slice(0, 8);
      if (!trimmedShortName) trimmedShortName = trimmedName.slice(0, 8);
    }

    let finalLat = Number(lat);
    let finalLon = Number(lon);
    let finalAddress = address.trim() || null;

    if (
      (!lat.trim() || !lon.trim() || !Number.isFinite(finalLat) || !Number.isFinite(finalLon)) &&
      address.trim()
    ) {
      setSubmitting(true);
      const geocoded = await lookupCoordinates();
      if (!geocoded) {
        setSubmitting(false);
        setError("Could not find coordinates for that address.");
        return;
      }
      finalLat = geocoded.lat;
      finalLon = geocoded.lon;
      finalAddress = geocoded.formattedAddress;
    }

    if (!Number.isFinite(finalLat) || finalLat < -90 || finalLat > 90) {
      setError("Latitude must be between -90 and 90.");
      return;
    }
    if (!Number.isFinite(finalLon) || finalLon < -180 || finalLon > 180) {
      setError("Longitude must be between -180 and 180.");
      return;
    }

    const parsedServiceMins = !isWarehouse ? Number(serviceMins) : 180;
    if (
      !isWarehouse &&
      (!Number.isInteger(parsedServiceMins) || parsedServiceMins < 0 || parsedServiceMins > 1440)
    ) {
      setError("Service minutes must be a whole number between 0 and 1440.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const success = await onAdd({
        name: trimmedName,
        shortName: trimmedShortName,
        address: finalAddress,
        latitude: finalLat,
        longitude: finalLon,
        isWarehouse,
        isLaundry: !isWarehouse,
        serviceMins: parsedServiceMins,
        isActive: true,
      });

      if (!success) {
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add facility.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className={dialogBackdrop}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(dialog, dialogMedium)}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="facility-dialog-title"
      >
        <header>
          <div>
            <span className={eyebrow}>
              <span className={eyebrowDot} />
              {isWarehouse ? "Logistics · Warehouse" : "Logistics · Laundry"}
            </span>
            <h2 id="facility-dialog-title">
              {isWarehouse ? "Add Warehouse" : "Add Laundry"}
            </h2>
          </div>
          <button
            type="button"
            className={dialogClose}
            onClick={onClose}
            disabled={submitting}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className={formError} role="alert">
              {error}
            </div>
          )}

          <div className={dialogGrid}>
            <label className={cn(field, dialogFull)}>
              <span className={fieldLabel}>
                {isWarehouse ? "Warehouse Name" : "Laundry Name"} <b>*</b>
              </span>
              <input
                type="text"
                required
                maxLength={120}
                value={name}
                placeholder={
                  isWarehouse
                    ? "e.g. North Bengaluru Warehouse, Peenya Depot"
                    : "e.g. Pioneer, Laundry Solutions South"
                }
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className={field}>
              <span className={fieldLabel}>
                Map Badge / Short Name <b>*</b>
              </span>
              <input
                type="text"
                maxLength={16}
                value={shortName}
                placeholder={isWarehouse ? "e.g. WH3, NB" : "e.g. LS, Pioneer"}
                onChange={(event) => setShortName(event.target.value)}
              />
            </label>

            {!isWarehouse && (
              <label className={field}>
                <span className={fieldLabel}>
                  Service Time (minutes on site)
                </span>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={serviceMins}
                  onChange={(event) => setServiceMins(event.target.value)}
                />
              </label>
            )}

            <label className={cn(field, dialogFull)}>
              <span className={fieldLabel}>Address</span>
              <div className={addressRow}>
                <input
                  type="text"
                  maxLength={300}
                  value={address}
                  placeholder="Street, area, city"
                  onChange={(event) => setAddress(event.target.value)}
                />
                <button
                  type="button"
                  className={addressRowButton}
                  onClick={lookupCoordinates}
                  disabled={geocoding || !address.trim()}
                >
                  <MapPin size={14} />
                  {geocoding ? "Looking up..." : "Find coordinates"}
                </button>
              </div>
            </label>

            {geocodeError && (
              <div
                className={cn(formError, dialogFull)}
                role="alert"
              >
                {geocodeError}
              </div>
            )}

            <label className={field}>
              <span className={fieldLabel}>
                Latitude <b>*</b>
              </span>
              <input
                type="number"
                step="any"
                value={lat}
                placeholder="e.g. 13.0172"
                onChange={(event) => setLat(event.target.value)}
              />
            </label>

            <label className={field}>
              <span className={fieldLabel}>
                Longitude <b>*</b>
              </span>
              <input
                type="number"
                step="any"
                value={lon}
                placeholder="e.g. 77.5465"
                onChange={(event) => setLon(event.target.value)}
              />
            </label>

            <div className={dialogFull}>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-muted, #64748b)",
                  margin: 0,
                }}
              >
                {isWarehouse
                  ? selectedRouteName
                    ? `This will create the warehouse in the master facility directory, add it to this plan, and assign ${selectedRouteName} to start and finish here.`
                    : "This will create the warehouse in the master facility directory and make it available for all routes in this plan."
                  : selectedRouteName
                    ? `This will create the laundry in the master facility directory, add it to this plan, and set it as the return destination for ${selectedRouteName}.`
                    : "This will create the laundry in the master facility directory and make it available as a return stop."}
              </p>
            </div>
          </div>

          <footer className={dialogActions}>
            <button
              type="button"
              className={btnGhost}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={btnPrimary}
              disabled={submitting}
            >
              {submitting
                ? "Creating..."
                : isWarehouse
                  ? "Add warehouse"
                  : "Add laundry"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

