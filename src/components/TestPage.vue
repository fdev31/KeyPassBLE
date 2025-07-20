<template>
    <Page>
        <ActionBar title="Test Page" class="action-bar" />
        <StackLayout class="page-container">
            <Label text="This is a test page." class="status-label" />
        </StackLayout>
    </Page>
</template>

<script lang="ts" setup>
// No script logic needed for a simple test
</script>

<style scoped>
.action-bar { background-color: #4F46E5; color: white; }
.page-container { padding: 16; }
.status-label { font-size: 18; text-align: center; color: #6B7280; margin-top: 20; }
</style>
