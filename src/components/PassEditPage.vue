<template>
    <Page @navigatingTo="onNavigatingTo">
        <ActionBar :title="isEditMode ? 'Edit Password' : 'Add New Password'" class="action-bar">
            <NavigationButton text="Back" />
        </ActionBar>
        <ScrollView>
            <StackLayout class="page-container">
                <Label text="Name" class="setting-label"></Label>
                <TextField v-model="name" hint="Enter a name for the password" class="setting-input"></TextField>

                <Label text="Password" class="setting-label"></Label>
                <Label v-if="isEditMode" text="(Leave blank to keep current password)" class="setting-label" style="font-size: 12; margin-top: -8; margin-bottom: 8;"></Label>
                <GridLayout columns="*, auto, auto" verticalAlignment="center">
                    <TextField col="0" v-model="password" :secure="!showPassword" hint="Enter password" class="setting-input" style="margin-bottom: 0;"></TextField>
                    <Button col="1" :text="showPassword ? 'Hide' : 'Show'" @tap="togglePasswordVisibility" class="btn btn-secondary toggle-button"></Button>
                    <Button col="2" text="🎲" @tap="generatePassword" class="btn btn-secondary toggle-button"></Button>
                </GridLayout>

                <Label text="Keyboard Layout" class="setting-label"></Label>
                <ListPicker :items="layoutLabels" v-model="selectedLayout" class="list-picker" />

                <Button text="Save" @tap="savePassword" class="btn btn-primary save-button"></Button>
            </StackLayout>
        </ScrollView>
    </Page>
</template>

<script lang="ts" setup>
import { ref, computed, $navigateBack } from 'nativescript-vue';
import { deviceAPI } from '../services/device-api';
import { NavigatedData } from '@nativescript/core';
import { passwordStore } from '../services/store';

const name = ref('');
const password = ref('');
const showPassword = ref(false);
const selectedLayout = ref(0); // Default to FR
const uid = ref<string | null>(null);
const isEditMode = ref(false);

const LAYOUT_OPTIONS = [
    { label: 'Bitlocker', value: -1 },
    { label: 'FR', value: 0 },
    { label: 'US', value: 1 },
];

const layoutLabels = computed(() => LAYOUT_OPTIONS.map(opt => opt.label));

const onNavigatingTo = (event: NavigatedData) => {
    if (event.isBack) {
        return;
    }
    const context = event.context as any;
    if (context && context.propsData && context.propsData.passwordEntry) {
        const passwordEntry = context.propsData.passwordEntry;
        isEditMode.value = true;
        name.value = passwordEntry.name;
        uid.value = passwordEntry.uid;
        selectedLayout.value = passwordEntry.layout + 1;
    }
};

const togglePasswordVisibility = () => {
    showPassword.value = !showPassword.value;
    if (password.value.length == 0) {
        deviceAPI.fetchPass(uid.value)
            .then((fetchedPassword) => {
                if (fetchedPassword === null) {
                    password.value = 'N/A';
                    return;
                }
                password.value = fetchedPassword?.m || 'Err';
            })
            .catch((error) => {
                console.error("Failed to fetch password:", error);
                alert(`Failed to fetch password: ${error.message || error}`);
            })
        ;
    }
};

const generatePassword = () => {
    const length = password.value.length;
    if (length === 0) {
        alert("Please enter a password to set the length for generation.");
        return;
    }
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{};:,.<>/?";
    let newPassword = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        newPassword += charset.charAt(Math.floor(Math.random() * n));
    }
    password.value = newPassword;
};

const savePassword = async () => {
    const saveAndReturn = async (uid, name, password, layout) => {
        await deviceAPI.editPass(uid, name, password, layout);
        passwordStore.addOrUpdate({
          uid: uid,
          name: name,
          layout: layout,
        });
        alert('Password updated successfully!');
        $navigateBack();
    }
    if (isEditMode.value) {
        // Edit existing password
        if (!name.value) {
            alert('Please enter a name.');
            return;
        }
        try {
            await saveAndReturn(parseInt(uid.value), name.value, password.value, selectedLayout.value);
        } catch (error) {
            console.error("Failed to update password:", error);
            alert(`Failed to update password: ${error.message || error}`);
        }
    } else {
        // Add new password
        if (!name.value || !password.value) {
            alert('Please fill in both name and password.');
            return;
        }
        try {
            await saveAndReturn(passwordStore.entries.length, name.value, password.value, selectedLayout.value);
        } catch (error) {
            console.error("Failed to save password:", error);
            alert(`Failed to save password: ${error.message || error}`);
        }
    }
};
</script>

<style scoped>
.page-container {
    padding: 16;
}

.action-bar {
    background-color: #4F46E5;
    color: white;
}

.setting-label {
    font-size: 18;
    font-weight: bold;
    margin-top: 16;
    margin-bottom: 8;
    color: #111827;
}

.setting-input {
    border-width: 1;
    border-color: #E5E7EB;
    border-radius: 8;
    padding: 12;
    font-size: 16;
    color: #374151;
    margin-bottom: 8;
}

.btn {
    border-radius: 8;
    font-size: 16;
    padding: 12;
}

.btn-primary {
    background-color: #4F46E5;
    color: white;
    margin-top: 16;
}

.btn-secondary {
    background-color: #6B7280;
    color: white;
}

.toggle-button {
    margin-left: 8;
    width: auto;
    padding-top: 8;
    padding-bottom: 8;
}

.save-button {
    margin-top: 24;
}

.list-picker {
    height: 120;
}
</style>
