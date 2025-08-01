<template>
    <Page @navigatingTo="onNavigatingTo">
        <ActionBar :title="isEditMode ? L('edit_password') : L('add_new_password')" class="action-bar">
            <NavigationButton :text="L('back')" />
        </ActionBar>
        <ScrollView>
            <StackLayout class="page-container">
                <Label :text="L('name')" class="setting-label"></Label>
                <TextField v-model="form.name" :hint="L('enter_name_for_password')" class="setting-input"></TextField>

                <Label :text="L('password')" class="setting-label"></Label>
                <Label v-if="isEditMode" :text="L('leave_blank_to_keep_password')" class="setting-label" style="font-size: 12; margin-top: -8; margin-bottom: 8;"></Label>
                <GridLayout columns="*, auto, auto" verticalAlignment="center">
                    <TextField col="0" v-model="form.password" :secure="!showPassword" :hint="L('enter_password')" class="setting-input" style="margin-bottom: 0;"></TextField>
                    <Button col="1" :text="showPassword ? L('hide') : L('show')" @tap="togglePasswordVisibility" class="btn btn-secondary toggle-button"></Button>
                    <Button col="2" text="🎲" @tap="generatePassword" class="btn btn-secondary toggle-button"></Button>
                </GridLayout>

                <Label :text="L('keyboard_layout')" class="setting-label"></Label>
                <ListPicker :items="layoutLabels" v-model="layoutIndex" class="list-picker" />

                <GridLayout v-if="isEditMode && passwordChanged" columns="*,*" class="type-buttons-container">
                    <Button col="0" :text="L('type_new')" @tap="typeNewPassword" class="btn btn-secondary"></Button>
                    <Button col="1" :text="L('type_current')" @tap="typeCurrentPassword" class="btn btn-secondary"></Button>
                </GridLayout>

                <Button :text="L('save')" @tap="savePassword" class="btn btn-primary save-button"></Button>
            </StackLayout>
        </ScrollView>
    </Page>
</template>

<script lang="ts" setup>
import { ref, computed, reactive, $navigateBack } from 'nativescript-vue';
import { deviceAPI } from '../services/device-api';
import { NavigatedData } from '@nativescript/core';
import { passwordStore } from '../services/store';
import { localize as L } from '@nativescript/localize';

// Define a type for our password entries for clarity
interface PasswordEntry {
    uid: number;
    name: string;
    layout: number;
    len: number;
}

// Keep layout options separate
const LAYOUT_OPTIONS = [
    { label: 'Bitlocker', value: -1 },
    { label: 'FR', value: 0 },
    { label: 'US', value: 1 },
];
const layoutLabels = LAYOUT_OPTIONS.map(opt => opt.label);

// This will hold the state of the form
const form = reactive({
    name: '',
    password: '', // This will always be the new password
    layout: 0,
});

// This will hold the original password entry when in edit mode
const originalPassword = ref<PasswordEntry | null>(null);

const isEditMode = computed(() => originalPassword.value !== null);

// The password from the form has been changed by the user
const passwordChanged = computed(() => form.password !== '');

// For the ListPicker v-model
const layoutIndex = computed({
    get: () => {
        const index = LAYOUT_OPTIONS.findIndex(opt => opt.value === form.layout);
        return index === -1 ? 1 : index; // Default to FR
    },
    set: (index) => {
        form.layout = LAYOUT_OPTIONS[index].value;
    }
});

const onNavigatingTo = (event: NavigatedData) => {
    if (event.isBack) return;

    const context = event.context as any;
    const entry = context?.propsData?.passwordEntry as PasswordEntry;

    if (entry && entry.name) { // We are editing an existing password
        originalPassword.value = entry;
        form.name = entry.name;
        form.layout = entry.layout ?? 0;
        form.password = ''; // Start with an empty password field
    } else { // We are adding a new password
        originalPassword.value = null;
        form.name = '';
        form.password = '';
        form.layout = 0; // Default to FR
    }
};

const showPassword = ref(false);

const togglePasswordVisibility = () => {
    showPassword.value = !showPassword.value;
    // If we are in edit mode, and we want to show the password,
    // but the new password field is empty, we should fetch the current password.
    if (isEditMode.value && showPassword.value && !form.password) {
        deviceAPI.fetchPass(originalPassword.value.uid)
            .then(fetched => {
                // We put the fetched password into the form.password field
                // so the user can see it and edit it.
                form.password = fetched?.m || L('not_available');
            })
            .catch(error => {
                console.error("Failed to fetch password:", error);
                alert(`${L('failed_to_fetch_password')} ${error.message || error}`);
            });
    }
};

const generatePassword = () => {
    // Use the length of the original password if available, otherwise default to 16
    const length = isEditMode.value ? originalPassword.value.len : 16;
    if (length === 0) {
        alert(L('cannot_determine_password_length'));
        return;
    }
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{};:,.<>/?";
    let newPassword = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        newPassword += charset.charAt(Math.floor(Math.random() * n));
    }
    form.password = newPassword;
};

// This function now makes more sense. It types the password from the input field.
const typeNewPassword = async () => {
    if (!form.password) {
        alert(L('password_field_empty'));
        return;
    }
    try {
        await deviceAPI.typeRaw(form.password);
    } catch (error) {
        alert(`${L('failed_to_type_new_password')} ${error.message || error}`);
    }
};

// This function types the original password, not what's in the input field.
const typeCurrentPassword = async () => {
    if (!isEditMode.value) return;
    try {
        await deviceAPI.typePass(originalPassword.value.uid);
    } catch (error) {
        alert(`${L('failed_to_type_current_password')} ${error.message || error}`);
    }
};

const savePassword = async () => {
    if (!form.name || (!form.password && !isEditMode.value)) {
        alert(L('fill_required_fields'));
        return;
    }

    const uidToSave = isEditMode.value ? originalPassword.value.uid : passwordStore.entries.length;

    try {
        await deviceAPI.editPass(uidToSave, form.name, form.password, form.layout);
        
        const newLen = form.password ? form.password.length : originalPassword.value?.len;

        passwordStore.addOrUpdate({
            uid: uidToSave,
            name: form.name,
            layout: form.layout,
            len: newLen,
        });
        alert(L('password_saved_successfully'));
        $navigateBack();
    } catch (error) {
        alert(`${L('failed_to_save_password')} ${error.message || error}`);
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

.type-buttons-container {
    margin-top: 16;
}

.save-button {
    margin-top: 24;
}

.list-picker {
    height: 120;
}
</style>