import { ref } from 'nativescript-vue';
import { ApplicationSettings } from '@nativescript/core';

export interface PasswordEntry {
  uid: number;
  name: string;
  layout?: number;
}

const passwordEntries = ref<PasswordEntry[]>([]);

// Load from cache initially
const cachedPasswords = ApplicationSettings.getString('cachedPasswords');
if (cachedPasswords) {
  try {
    passwordEntries.value = JSON.parse(cachedPasswords);
  } catch (e) {
    console.error("Failed to parse cached passwords:", e);
  }
}

export const passwordStore = {
  // Expose a getter to access the ref's value directly
  get entries() {
    return passwordEntries.value;
  },

  // For reactivity, expose the raw ref as well
  entriesRef: passwordEntries,

  addOrUpdate(entry: PasswordEntry) {
    const index = passwordEntries.value.findIndex(e => e.uid === entry.uid);
    if (index >= 0) {
      passwordEntries.value[index] = entry;
    } else {
      passwordEntries.value.push(entry);
    }
    this.saveToCache();
  },

  saveToCache() {
    ApplicationSettings.setString('cachedPasswords', JSON.stringify(passwordEntries.value));
  }
};

export const appStore = {
    isInitialLoadComplete: ref(false),
};