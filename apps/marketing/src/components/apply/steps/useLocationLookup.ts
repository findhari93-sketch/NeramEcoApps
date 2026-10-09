'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormContext } from '../FormContext';
import { INDIA_PIN, isListedCountry } from '../countryConfig';

/**
 * "Where you live" on About you. In India the student types a PIN code and
 * the place (city, district, state) is looked up and shown under it; Edit
 * opens it for correcting, and an edit sticks until a different PIN is typed.
 * Each lookup is also kept in detectedLocation, so staff can compare what the
 * lookup said with what the student kept. Abroad there is no lookup: a
 * country and a typed city. The browser's location is asked for only on a press.
 */
export function useLocationLookup() {
  const t = useTranslations('apply');
  const { formData, updateFormData } = useFormContext();
  const { location, personal } = formData;

  const [isPincodeLooking, setIsPincodeLooking] = useState(false);
  const [pincodeError, setPincodeError] = useState<string | null>(null);
  const [isPlaceEditable, setIsPlaceEditable] = useState(false);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const lookupSeq = useRef(0);

  const lookupPincode = useCallback(
    async (pincode: string) => {
      const seq = ++lookupSeq.current;
      setIsPincodeLooking(true);
      setPincodeError(null);
      try {
        const response = await fetch(`/api/pincode/${pincode}?country=IN`);
        const data = await response.json();
        if (seq !== lookupSeq.current) return;
        if (data.success && data.data) {
          const city = data.data.city || data.data.district || '';
          const place = { city, state: data.data.state || '', district: data.data.district || '' };
          updateFormData('location', {
            ...place,
            locationSource: 'pincode',
            detectedLocation: { pincode, ...place, country: 'IN' },
          });
          setIsPlaceEditable(false);
        } else {
          setPincodeError(t('aboutYou.pinNotFound'));
          setIsPlaceEditable(true);
        }
      } catch {
        if (seq !== lookupSeq.current) return;
        setPincodeError(t('aboutYou.pinNotFound'));
        setIsPlaceEditable(true);
      } finally {
        if (seq === lookupSeq.current) setIsPincodeLooking(false);
      }
    },
    [t, updateFormData]
  );

  // A PIN restored from a draft or an account, with no place yet: look it up once.
  const restoredLookup = useRef(false);
  useEffect(() => {
    if (restoredLookup.current) return;
    if (location.country !== 'IN' || !INDIA_PIN.test(location.pincode)) return;
    restoredLookup.current = true;
    if (!location.city.trim()) lookupPincode(location.pincode);
  }, [location.country, location.pincode, location.city, lookupPincode]);

  const handlePincodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    if (cleaned === location.pincode) return;
    restoredLookup.current = true;
    setPincodeError(null);
    // The place under a changed PIN no longer belongs to it, unless the student typed it.
    const fromLookup = location.locationSource !== 'manual';
    updateFormData('location', fromLookup ? { pincode: cleaned, city: '', state: '', district: '' } : { pincode: cleaned });
    if (INDIA_PIN.test(cleaned)) {
      lookupPincode(cleaned);
    } else {
      lookupSeq.current++;
      setIsPincodeLooking(false);
      if (fromLookup) setIsPlaceEditable(false);
    }
  };

  /** City or state typed by the student: theirs from now on. */
  const editPlace = (patch: { city?: string; state?: string }) => {
    updateFormData('location', { ...patch, locationSource: 'manual' });
  };

  /**
   * Moving between India and abroad, or between countries abroad. The place
   * belongs to the old country, so it is cleared. While the mobile is still
   * empty and unverified its code follows, since that is the likely case.
   */
  const handleResidenceChange = (country: string) => {
    if (country === location.country) return;
    lookupSeq.current++;
    setIsPincodeLooking(false);
    setPincodeError(null);
    setIsPlaceEditable(false);
    updateFormData('location', {
      country,
      countryName: '',
      pincode: '',
      city: '',
      state: '',
      district: '',
      locationSource: null,
    });
    if (!personal.phone && !personal.phoneVerified && isListedCountry(country)) {
      updateFormData('personal', { phoneCountry: country });
    }
  };

  const requestGeolocation = () => {
    if (!('geolocation' in navigator)) return;
    setIsGeolocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        updateFormData('location', { latitude, longitude });
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          const address = data.address;
          if (address) {
            const city = address.city || address.town || address.village || '';
            const state = address.state || '';
            const district = address.county || address.state_district || '';
            const pincode = String(address.postcode || '').replace(/\s/g, '');
            const country = address.country_code?.toUpperCase() || null;
            updateFormData('location', { detectedLocation: { pincode, city, state, district, country } });

            // Only fill what is still empty; an edited place is never replaced.
            if (location.country === 'IN' && country === 'IN') {
              if (!location.pincode && INDIA_PIN.test(pincode)) {
                updateFormData('location', {
                  pincode,
                  ...(location.city ? {} : { city, state, district }),
                  locationSource: location.locationSource === 'manual' ? 'manual' : 'geolocation',
                });
              }
            } else if (location.country !== 'IN' && !location.city && city) {
              updateFormData('location', { city, locationSource: 'geolocation' });
            }
          }
        } catch {
          // Reverse geocoding is best effort.
        }
        setIsGeolocating(false);
      },
      () => {
        setGeoError(t('aboutYou.locationFailed'));
        setIsGeolocating(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  return {
    isPincodeLooking,
    pincodeError,
    isPlaceEditable,
    setIsPlaceEditable,
    isGeolocating,
    geoError,
    requestGeolocation,
    handlePincodeChange,
    handleResidenceChange,
    editPlace,
  };
}
