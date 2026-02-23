class BikeAccidentDetector {
    constructor() {
        this.isActive = false;
        this.isDetecting = false;
        this.accelerationHistory = [];
        this.maxHistoryLength = 10;
        this.threshold = 3.5; // g-force threshold
        this.countdownTime = 10; // seconds
        this.countdownInterval = null;
        this.location = null;
        this.contacts = [];
        this.settings = {
            enableSound: true,
            enableVibration: true
        };
        
        this.init();
    }
    
    async init() {
        // Check for PWA install
        this.setupPWA();
        
        // Load saved data
        this.loadData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Request permissions and start sensors
        await this.requestPermissions();
        
        // Update status display
        this.updateStatus();
    }
    
    setupPWA() {
        let deferredPrompt;
        const installBtn = document.getElementById('install-btn');
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.style.display = 'flex';
            
            installBtn.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    installBtn.style.display = 'none';
                }
                
                deferredPrompt = null;
            });
        });
        
        window.addEventListener('appinstalled', () => {
            installBtn.style.display = 'none';
            deferredPrompt = null;
        });
    }
    
    setupEventListeners() {
        // Toggle system
        document.getElementById('toggle-system').addEventListener('click', () => this.toggleSystem());
        
        // Test alert
        document.getElementById('test-alert').addEventListener('click', () => this.testAlert());
        
        // Contact management
        document.getElementById('add-contact').addEventListener('click', () => this.showContactModal());
        document.getElementById('cancel-contact').addEventListener('click', () => this.hideContactModal());
        document.getElementById('save-contact').addEventListener('click', () => this.saveContact());
        
        // Countdown controls
        document.getElementById('cancel-alert').addEventListener('click', () => this.cancelAlert());
        document.getElementById('send-now').addEventListener('click', () => this.sendEmergencyAlert());
        
        // Settings
        document.getElementById('threshold').addEventListener('input', (e) => this.updateThreshold(e.target.value));
        document.getElementById('countdown-time').addEventListener('change', (e) => this.countdownTime = parseInt(e.target.value));
        document.getElementById('enable-sound').addEventListener('change', (e) => this.settings.enableSound = e.target.checked);
        document.getElementById('enable-vibration').addEventListener('change', (e) => this.settings.enableVibration = e.target.checked);
        
        // Install button
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                this.updateBatteryStatus(battery);
                battery.addEventListener('levelchange', () => this.updateBatteryStatus(battery));
            });
        }
    }
    
    async requestPermissions() {
        try {
            // Request notification permission
            if ('Notification' in window && Notification.permission !== 'granted') {
                await Notification.requestPermission();
            }
            
            // Request geolocation permission
            if ('geolocation' in navigator) {
                this.watchLocation();
            }
            
            // Check for DeviceMotion API
            if (typeof DeviceMotionEvent !== 'undefined' && 
                typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission === 'granted') {
                        this.setupMotionSensors();
                    }
                } catch (error) {
                    console.warn('DeviceMotion permission denied:', error);
                }
            } else {
                this.setupMotionSensors();
            }
            
        } catch (error) {
            console.error('Permission request failed:', error);
        }
    }
    
    setupMotionSensors() {
        if ('DeviceMotionEvent' in window) {
            window.addEventListener('devicemotion', (event) => {
                this.handleMotion(event);
            });
            
            document.getElementById('sensor-status').textContent = 'Sensors: Active';
        } else {
            document.getElementById('sensor-status').textContent = 'Sensors: Not Available';
        }
    }
    
    watchLocation() {
        if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition(
                (position) => {
                    this.location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                    document.getElementById('gps-status').textContent = 'GPS: Active';
                },
                (error) => {
                    console.error('GPS Error:', error);
                    document.getElementById('gps-status').textContent = 'GPS: Error';
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 10000,
                    timeout: 5000
                }
            );
        }
    }
    
    handleMotion(event) {
        const acceleration = event.accelerationIncludingGravity || event.acceleration;
        if (!acceleration) return;
        
        // Calculate total g-force
        const gForce = Math.sqrt(
            Math.pow(acceleration.x || 0, 2) +
            Math.pow(acceleration.y || 0, 2) +
            Math.pow(acceleration.z || 0, 2)
        ) / 9.81;
        
        // Update display
        document.getElementById('acceleration').textContent = `${gForce.toFixed(2)} g`;
        
        // Add to history
        this.accelerationHistory.push(gForce);
        if (this.accelerationHistory.length > this.maxHistoryLength) {
            this.accelerationHistory.shift();
        }
        
        // Calculate jerk (rate of change of acceleration)
        if (this.accelerationHistory.length >= 2) {
            const jerk = Math.abs(this.accelerationHistory[this.accelerationHistory.length - 1] - 
                                this.accelerationHistory[this.accelerationHistory.length - 2]);
            document.getElementById('last-jerk').textContent = `${jerk.toFixed(2)} g/s`;
            
            // Check for sudden impact (high jerk + high g-force)
            if (this.isActive && !this.isDetecting && 
                gForce > this.threshold && jerk > 1.5) {
                this.detectImpact(gForce);
            }
        }
        
        // Update progress bar
        const progress = Math.min((gForce / this.threshold) * 100, 100);
        document.getElementById('impact-progress').style.width = `${progress}%`;
        
        // Update impact force display
        document.getElementById('impact-force').textContent = `${gForce.toFixed(2)} g`;
        
        // Change color based on severity
        const progressFill = document.getElementById('impact-progress');
        if (gForce > this.threshold) {
            progressFill.style.background = 'linear-gradient(90deg, var(--warning), var(--primary))';
        } else if (gForce > this.threshold * 0.7) {
            progressFill.style.background = 'linear-gradient(90deg, var(--safe), var(--warning))';
        } else {
            progressFill.style.background = 'linear-gradient(90deg, var(--safe), var(--warning), var(--primary))';
        }
    }
    
    detectImpact(gForce) {
        this.isDetecting = true;
        
        // Trigger emergency alert
        this.triggerEmergencyAlert(gForce);
    }
    
    async triggerEmergencyAlert(gForce) {
        console.log(`Impact detected: ${gForce.toFixed(2)}g`);
        
        // Update UI for emergency
        document.getElementById('system-status').innerHTML = `
            <div class="indicator alert"></div>
            <span>ALERT TRIGGERED!</span>
        `;
        
        // Show countdown overlay
        this.showCountdownOverlay();
        
        // Start countdown
        let timeLeft = this.countdownTime;
        document.getElementById('countdown-timer').textContent = timeLeft;
        
        // Update location in overlay
        this.updateLocationInfo();
        
        // Start alarm and vibration
        this.startAlarm();
        
        // Start countdown
        this.countdownInterval = setInterval(() => {
            timeLeft--;
            document.getElementById('countdown-timer').textContent = timeLeft;
            
            if (timeLeft <= 0) {
                clearInterval(this.countdownInterval);
                this.sendEmergencyAlert();
            }
        }, 1000);
    }
    
    showCountdownOverlay() {
        document.getElementById('countdown-overlay').style.display = 'flex';
        document.body.classList.add('vibrate');
    }
    
    hideCountdownOverlay() {
        document.getElementById('countdown-overlay').style.display = 'none';
        document.body.classList.remove('vibrate');
    }
    
    startAlarm() {
        if (this.settings.enableSound) {
            const alarmSound = document.getElementById('alarm-sound');
            alarmSound.play().catch(e => console.log('Audio play failed:', e));
        }
        
        if (this.settings.enableVibration && 'vibrate' in navigator) {
            navigator.vibrate([500, 200, 500, 200, 500]);
        }
    }
    
    stopAlarm() {
        const alarmSound = document.getElementById('alarm-sound');
        alarmSound.pause();
        alarmSound.currentTime = 0;
        
        if ('vibrate' in navigator) {
            navigator.vibrate(0);
        }
    }
    
    cancelAlert() {
        clearInterval(this.countdownInterval);
        this.isDetecting = false;
        this.stopAlarm();
        this.hideCountdownOverlay();
        this.updateStatus();
        
        // Show confirmation
        this.showNotification('Alert cancelled', 'System is back to monitoring');
    }
    
    async sendEmergencyAlert() {
        clearInterval(this.countdownInterval);
        this.stopAlarm();
        this.hideCountdownOverlay();
        
        // Get current location if not available
        if (!this.location) {
            await this.getCurrentLocation();
        }
        
        // Send alerts to all contacts
        for (const contact of this.contacts) {
            await this.sendAlertToContact(contact);
        }
        
        // Reset system
        this.isDetecting = false;
        this.updateStatus();
        
        // Show confirmation
        this.showNotification('Emergency alert sent!', 'Your contacts have been notified');
    }
    
    async sendAlertToContact(contact) {
        const message = this.createEmergencyMessage(contact.name);
        const phoneNumber = contact.phone.replace(/\D/g, '');
        
        // Try WhatsApp
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
        
        // Open WhatsApp in new tab
        window.open(whatsappUrl, '_blank');
        
        // Fallback to SMS if WhatsApp fails
        setTimeout(() => {
            if ('sms' in navigator) {
                navigator.ms.sendSms(phoneNumber, message);
            }
        }, 2000);
    }
    
    createEmergencyMessage(contactName) {
        const time = new Date().toLocaleTimeString();
        const date = new Date().toLocaleDateString();
        const locationLink = this.location ? 
            `https://maps.google.com/?q=${this.location.latitude},${this.location.longitude}` :
            'Location unavailable';
        
        return `🚨 EMERGENCY ALERT 🚨

Bike Accident Detected!

👤 User needs immediate assistance
📍 Location: ${locationLink}
🕒 Time: ${time}
📅 Date: ${date}

This is an automated alert from BikeGuard.
If you receive this message, please check on the user immediately.

Latitude: ${this.location?.latitude || 'N/A'}
Longitude: ${this.location?.longitude || 'N/A'}
Accuracy: ${this.location?.accuracy ? Math.round(this.location.accuracy) + ' meters' : 'N/A'}

⚠️ Please take appropriate action!`;
    }
    
    async getCurrentLocation() {
        return new Promise((resolve) => {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.location = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy
                        };
                        resolve(this.location);
                    },
                    () => {
                        resolve(null);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 5000,
                        maximumAge: 0
                    }
                );
            } else {
                resolve(null);
            }
        });
    }
    
    updateLocationInfo() {
        const locationInfo = document.getElementById('location-info');
        if (this.location) {
            locationInfo.innerHTML = `
                Location: ${this.location.latitude.toFixed(6)}, ${this.location.longitude.toFixed(6)}
                <br><small>Accuracy: ${Math.round(this.location.accuracy)} meters</small>
            `;
        } else {
            locationInfo.textContent = 'Getting location...';
            this.getCurrentLocation().then(() => {
                if (this.location) {
                    locationInfo.innerHTML = `
                        Location: ${this.location.latitude.toFixed(6)}, ${this.location.longitude.toFixed(6)}
                        <br><small>Accuracy: ${Math.round(this.location.accuracy)} meters</small>
                    `;
                }
            });
        }
    }
    
    toggleSystem() {
        this.isActive = !this.isActive;
        
        const toggleBtn = document.getElementById('toggle-system');
        const statusIndicator = document.getElementById('system-status');
        
        if (this.isActive) {
            toggleBtn.innerHTML = '<i class="fas fa-power-off"></i> Stop Protection';
            toggleBtn.classList.remove('btn-primary');
            toggleBtn.classList.add('btn-secondary');
            statusIndicator.innerHTML = `
                <div class="indicator active"></div>
                <span>ACTIVE</span>
            `;
            this.showNotification('Protection Activated', 'BikeGuard is now monitoring for accidents');
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-power-off"></i> Start Protection';
            toggleBtn.classList.remove('btn-secondary');
            toggleBtn.classList.add('btn-primary');
            statusIndicator.innerHTML = `
                <div class="indicator inactive"></div>
                <span>INACTIVE</span>
            `;
            this.showNotification('Protection Deactivated', 'BikeGuard is not monitoring');
        }
    }
    
    testAlert() {
        if (!this.isActive) {
            this.showNotification('Please activate system first', 'Click "Start Protection" to begin monitoring');
            return;
        }
        
        // Simulate an impact
        this.detectImpact(this.threshold + 1);
        
        this.showNotification('Test Alert Started', 'Countdown initiated - cancel to stop test');
    }
    
    updateThreshold(value) {
        this.threshold = parseFloat(value);
        document.getElementById('threshold-value').textContent = `${value}g`;
        document.getElementById('threshold-display').textContent = `${value}g`;
        this.saveSettings();
    }
    
    showContactModal() {
        document.getElementById('contact-modal').style.display = 'flex';
    }
    
    hideContactModal() {
        document.getElementById('contact-modal').style.display = 'none';
        document.getElementById('contact-name').value = '';
        document.getElementById('contact-phone').value = '';
    }
    
    saveContact() {
        const name = document.getElementById('contact-name').value.trim();
        const phone = document.getElementById('contact-phone').value.trim();
        
        if (!name || !phone) {
            this.showNotification('Please fill all fields', 'Name and phone number are required');
            return;
        }
        
        const contact = {
            id: Date.now(),
            name: name,
            phone: phone
        };
        
        this.contacts.push(contact);
        this.saveContacts();
        this.renderContacts();
        this.hideContactModal();
        
        this.showNotification('Contact saved', `${name} added to emergency contacts`);
    }
    
    deleteContact(id) {
        this.contacts = this.contacts.filter(contact => contact.id !== id);
        this.saveContacts();
        this.renderContacts();
    }
    
    renderContacts() {
        const contactsList = document.getElementById('contacts-list');
        
        if (this.contacts.length === 0) {
            contactsList.innerHTML = `
                <div class="empty-contacts">
                    <i class="fas fa-user-plus"></i>
                    <p>No contacts added yet</p>
                </div>
            `;
            return;
        }
        
        contactsList.innerHTML = this.contacts.map(contact => `
            <div class="contact-item">
                <div class="contact-info">
                    <h4>${contact.name}</h4>
                    <p>${contact.phone}</p>
                </div>
                <button class="delete-contact" onclick="bikeGuard.deleteContact(${contact.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }
    
    updateStatus() {
        // Update battery status
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                this.updateBatteryStatus(battery);
            });
        }
    }
    
    updateBatteryStatus(battery) {
        const batteryElem = document.getElementById('battery-status');
        const level = Math.round(battery.level * 100);
        
        batteryElem.textContent = `Battery: ${level}%`;
        
        if (battery.charging) {
            batteryElem.innerHTML += ' 🔌';
        } else if (level < 20) {
            batteryElem.innerHTML += ' ⚠️';
        }
    }
    
    showNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚲</text></svg>'
            });
        }
        
        // Also show in-page toast
        this.showToast(message);
    }
    
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--primary);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    saveData() {
        const data = {
            contacts: this.contacts,
            settings: this.settings,
            threshold: this.threshold,
            countdownTime: this.countdownTime
        };
        localStorage.setItem('bikeGuard', JSON.stringify(data));
    }
    
    loadData() {
        const saved = localStorage.getItem('bikeGuard');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.contacts = data.contacts || [];
                this.settings = data.settings || this.settings;
                this.threshold = data.threshold || 3.5;
                this.countdownTime = data.countdownTime || 10;
                
                // Update UI
                document.getElementById('threshold').value = this.threshold;
                document.getElementById('threshold-display').textContent = `${this.threshold}g`;
                document.getElementById('threshold-value').textContent = `${this.threshold}g`;
                document.getElementById('countdown-time').value = this.countdownTime;
                document.getElementById('enable-sound').checked = this.settings.enableSound;
                document.getElementById('enable-vibration').checked = this.settings.enableVibration;
                
                this.renderContacts();
            } catch (e) {
                console.error('Failed to load saved data:', e);
            }
        }
    }
    
    saveSettings() {
        this.saveData();
    }
    
    saveContacts() {
        this.saveData();
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.bikeGuard = new BikeAccidentDetector();
    
    // Add CSS for toast animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    // Service Worker registration for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(error => {
                console.log('Service Worker registration failed:', error);
            });
        });
    }
});
