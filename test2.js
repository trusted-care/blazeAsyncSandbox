const babel = require("@babel/core");
const myPlugin = require("./babelPlugin/plugin_syncAutoruns");

const sourceCode = `/**
 * @file helpers, events, and rendered events for stream template
 */

import aget from '/imports/lib/aget'

import MonitoringService from '/imports/services/monitoring/MonitoringService.class'

import clearExpertUnreadFlagsForStream from '/imports/services/communication/methods/clearExpertUnreadFlagsForStream'
import markMessagesAsSeen from '/imports/services/communication/methods/messages/markMessagesAsSeen'
import markAllMessagesAsSeen from '/imports/services/communication/methods/messages/markAllMessagesAsSeen'
import setPatientHasSeenStreamBefore from '/imports/services/communication/methods/setPatientHasSeenStreamBefore'
import endPatientRetentionPhase from '/imports/services/monitoring/methods/endPatientRetentionPhase'

import bookings_cancelBooking from '/imports/services/appointmentBooking/methods/cancelBooking'
import bookings_markAppointmentKept from '/imports/services/appointmentBooking/methods/markAppointmentKept'

import endMonitoring from '/imports/services/monitoring/methods/endMonitoring'

import { startCall } from '/imports/services/videoCall/client/videoChat'

// make sure default settings are loaded
import '/imports/lib/_defaultSettings'

// appointment button recheck / rerender interval
const updateDateBasedStreamContentInterval = 5000

import { areAllGlobalSubsReady } from '/imports/startup/client/client-init'

import './stream.html'


/**
 * For cordova - a reactive variable which lets us wait until the app is in the foreground to trigger certain things,
 * eg. marking incoming messages as read should only happen while the app is in the foreground.
 *
 * This is set to true, so that it works also on start up, when App is not minimized, yet.
 */
const appIsInForeground = new ReactiveVar(true)

if (Meteor.isCordova) {
    // Wait for background / pause & forground events & set the current
    // foreground status accordingly in a reactive var.
    document.addEventListener('deviceready', () => {
        document.addEventListener('pause', () => {
            appIsInForeground.set(false)
        })
        document.addEventListener('resume', () => {
            appIsInForeground.set(true)
        })
    })
}

/**
 * Allow other scripts to wait until the script has been completely rendered once.
 * Maybe add another few ms for things to settle down afterwards.
 *
 * NOTE: This'll stay true forever once the first stream has been rendered completely.
 */
export const hasStreamBeenRendered = new ReactiveVar(false)

/**
 * Create subsCaches for the most recent streams which have been opened.
 */
const subsCache = new SubsCache(0, 40)

const messagesSubsCache = new SubsCache(0, 50)

/**
 * We use this to make the progress through the different loading + subscriptions states easier and clearer.
 */
const TEMPLATE_PROGRESS_STATES = ['INITIAL', 'STREAM_STORED', 'WAIT_FOR_MESSAGES_SUBSCRIPTIONS', 'FIRST_MESSAGES_SUBSCRIPTIONS_COMPLETE', 'MESSAGES_READY', 'ALL_SUBS_AND_MESSAGES_READY', 'RENDERED', 'LOAD_MORE']

const TEMPLATE_PROGRESS_STATE_STATE_FLAGS = {}

_.each(TEMPLATE_PROGRESS_STATES, (state, idx) => {
    TEMPLATE_PROGRESS_STATE_STATE_FLAGS['TEMPLATE_PROGRESS_STATES_' + state] = 0 === idx
})

/**
 * Throttled function which scrolls the stream down for new messages.
 */
const scrollToBottom = _.debounce(() => {
    // Wait until all images are loaded in the stream channel, before calculating the height of the stream.
    const deferreds = []
    $('.streamchannel img').each(function() {
        if (!this.complete) {
            const deferred = $.Deferred()
            $(this).one('load', deferred.resolve)
            deferreds.push(deferred)
        }
    })
    $.when.apply($, deferreds).done(function() {
        const streamContainer = $('.streamchannel').closest('.content')

        if (!streamContainer.length) {
            return
        }
        const height = streamContainer.height()
        let scrollTop = streamContainer[0].scrollHeight - height
        streamContainer.animate({scrollTop})
    })
}, 100)

/**
 * If there are unread messages, there is a div element rendered above the first unread message to which to scroll to.
 */
const scrollToFirstUnreadMessage = _.debounce(() => {
    // Wait until all images are loaded in the stream channel, before calculating the height of the stream.
    const deferreds = []
    $('.streamchannel img').each(function() {
        if (!this.complete) {
            const deferred = $.Deferred()
            $(this).one('load', deferred.resolve)
            deferreds.push(deferred)
        }
    })
    $.when.apply($, deferreds).done(function() {
        const streamContainer = $('.streamchannel').closest('.content')

        if (!streamContainer.length) {
            return
        }

        /**
         * If there are unread messages, scroll to the earliest unread message.
         */
        if ($('.js-newMessagesElement').length) {
            // first scroll up and then scroll down to the unread-message-bar
            streamContainer.scrollTop(0)
            const actionReminderButtonHolder = $('.reminder-button-holder').height() // consider the snackbars
            const scrollTop = $('.js-newMessagesElement').offset().top - actionReminderButtonHolder - 50 // - 50px of the NavBar
            streamContainer.scrollTop(scrollTop)
        }
    })
}, 100)

/**
 * This is it, it's all about the stream with Trusted Care...
 */
TemplateController('stream', {
    state: {
        ...TEMPLATE_PROGRESS_STATE_STATE_FLAGS,

        now: undefined,

        // current stream document
        stream: undefined,
        stream_id: undefined,
        numRawMessages: 0,
        // this contains all messages currently in the stream!
        messages: [],

        // how many messages to show at the moment
        limit: Meteor.settings.public.stream.num_initial_messages,
        loadMoreInProgress: false,

        // for logged-in user, scroll to last unread message
        firstUnreadMessage: undefined,
        unreadMessages: [],
        isFirstStreamLoad: true,

        /**
         * Patient which visit a stream for the first time shouldn't have their stream scrolled all the way to the bottom
         * but instead stay at the top so they can see the welcome messages in their entirety.
         */
        jumpToBottomAfterLoad: true,
    },
    private: {
        distanceFromBottomWhenLoadMoreButtonWasPressed: undefined,

        logCurrentProgressState() {
            console.table(_.map(TEMPLATE_PROGRESS_STATES, (state) => {  // eslint-disable-line no-console
                return {
                    state,
                    value: this.state['TEMPLATE_PROGRESS_STATES_' + state],
                }
            }))
        },
        /**
         * Get the current template progress state, but reactive *only* if the state reverts to a state *before* the current
         * loading state...
         */
        getTemplateProgressStateHasReachedOrPassed(state) {
            return this.state['TEMPLATE_PROGRESS_STATES_' + state]
        },

        /**
         * React to every template state change
         */
        getTemplateState() {
            let mostUpToDateState
            _.find(TEMPLATE_PROGRESS_STATES, (state) => {
                if (this.getTemplateProgressStateHasReachedOrPassed(state)) {
                    mostUpToDateState = state
                }
                // IMPORTANT: DON'T BREAK OUT OF THE LOOP, WE WANT REACTIVITY FOR ALL POSSIBLE STATE VARIABLES
            })
            return mostUpToDateState
        },
        /**
         * Progress State to the new state.
         *
         * NOTE: All states before the new state will be turned to true, all after the current state to false, so that
         * we always have a continuous stream of on states / off states with no other gaps. Eg:
         *
         * NOTE II: We will always ONLY GO FORWARD - we never "pull back" a state once it has been set.
         *
         * [1 1 1 0 0 ] <- will look like this
         *
         * [0 1 0 1 0] <- Never like this
         */
        setTemplateProgressState(newState) {
            if (!_.includes(TEMPLATE_PROGRESS_STATES, newState)) {
                throw new Meteor.Error('INVALID STATE')
            }

            // get the current state...
            const currentPositionInArray = _.indexOf(TEMPLATE_PROGRESS_STATES, this.getTemplateState())
            // and the new state...
            const newStatePositionInArray = _.indexOf(TEMPLATE_PROGRESS_STATES, newState)

            if (currentPositionInArray >= newStatePositionInArray) {
                return
            }

            // If the new state isn't after the current state, we don't do nothing, because we don't want to
            // unset the states once set.
            _.each(TEMPLATE_PROGRESS_STATES, (state, idx) => {
                this.state['TEMPLATE_PROGRESS_STATES_' + state] = idx <= newStatePositionInArray
            })
        },
    },
    onCreated() {
        /**
         * Development helper, set to true to see state transitions during the stream initialization
         */
        const LOG_STATE_CHANGES = false
        const logCurrentState = () => {
            console.info('template_progress_state:', this.getTemplateState())
        }
        if (LOG_STATE_CHANGES) {
            this.autorun(() => {
                logCurrentState()
            })
        }

        /**
         * Hide the stream while it is being rendered so the user sees no jankiness, only the finished stream.
         * It's possible that another stream started the UIBlock before transitioning to the stream, so we check
         * whether we actually have to create a new one first.
         */
        if (!UIBlock.status()) {
            UIBlock.block()
        }

        // Hide the UIBlock once the stream has been fully loaded
        this.autorun((c) => {
            if (!this.state.TEMPLATE_PROGRESS_STATES_RENDERED) {
                return
            }
            UIBlock.unblock()
            c.stop()
        })

        /**
         * Subscribe to the stream, in case it's not one of the perma-subscribed cockpit streams
         */
        this.autorun(async () => {
            const stream_id = FlowRouter.getParam('stream_id')
            FlowRouter.watchPathChange()
            if (!stream_id) {
                return
            }
            /**
             * Double-sub besides the subs-cache so we can wait for the ready using the template ready - method.
             *
             * These should already be subscribed to on the patient side of things, but still this wait we can use the
             * template.subscriptionsReady() - method to wait for readiness.
             */
            // subsCache.subscribe('streamAndUsers', stream_id, async () => {
            //     // if the expert or patient doesn't have access to this stream, redirect him to his "default" index.
            //     if (!await Collections.Streams.findOneAsync(stream_id)) {
            //         FlowRouter.go('index')
            //         UIBlock.unblock()
            //     }
            // })
            this.subscribe('streamAndUsers', stream_id)
            subsCache.subscribe('monitoringsForStream', stream_id)
            this.subscribe('monitoringsForStream', stream_id)

            const stream = await Collections.Streams.findOneAsync(stream_id)
            if (!stream) {
                return
            }

            this.state.stream = stream
            this.state.stream_id = stream && stream._id

            /**
             * Leave the stream if the patient deactivates / unregisters himself.
             */
            if (stream && stream.patientDeactivated) {
                toastr.info('')
                FlowRouter.go('cockpit')
                // Unblock the UI if redirecting to cockpit since its a valid route.
                UIBlock.unblock()
            }

            const _areAllGlobalSubsReady = areAllGlobalSubsReady.get()

            /**
             * Mostly for the time machine: If the stream ceases to exist, guide us back gently to the cockpit please...
             * todo test fails because subs not ready.
             * todo if we want this figure out a way to wait until the subs are ready again after loading a snapshot / time travelling
             * before this runs again.
             */
            //if (!this.state.stream && !Meteor.isAppTest) {
            //    const user = Meteor.user()
            //    if (user && user.isExpert()) {
            //        FlowRouter.go('cockpit')
            //    }
            //}

            if (_areAllGlobalSubsReady && this.state.stream) {
                this.setTemplateProgressState('STREAM_STORED')
            }
        })

        /**
         * Make sure that first time patients can see the welcome messages, disable jumping to the bottom of the stream on load
         */
        this.autorun((c) => {
            const user = Meteor.user()
            if (Meteor.loggingIn() || !user) {
                return
            }

            if (!this.getTemplateProgressStateHasReachedOrPassed('ALL_SUBS_AND_MESSAGES_READY')) {
                return
            }
            if (user.isPatient() && !user.patient_hasSeenStreamBefore) {
                this.state.jumpToBottomAfterLoad = false
            }
            c.stop()
        })
        /**
         * Mark the patient as "welcome message has been seen"
         */
        this.autorun((c) => {
            if (!this.getTemplateProgressStateHasReachedOrPassed('RENDERED')) {
                return
            }
            const user = Meteor.user()
            if (!user.isPatient() || user.patient_hasSeenStreamBefore) {
                c.stop()
                return
            }
            this.setTimeout(() => {
                setPatientHasSeenStreamBefore.call({}, (error, result) => {
                    if (error) {
                        Logger.error('STREAM:setPatientHasSeenStreamBefore', error)
                    }
                })
            }, 10000)
            c.stop()
        })

        /**
         * Keep a clock ticking for some of the information in the stream
         */
        // auto-update date calculations once a minute
        this.setInterval(() => {
            this.state.now = moment()
        }, updateDateBasedStreamContentInterval)
        this.state.now = moment()

        /**
         * Subscribe to all relevant collections...
         */
        this.autorun(() => {
            if (!this.getTemplateProgressStateHasReachedOrPassed('STREAM_STORED')) {
                return
            }
            if (!this.state.stream_id) {
                return
            }

            // in Tests with time, user was null and publications errored out.
            // but I comment it out, because it does not seem to rerun.
            //if (!Meteor.user() || !this.user_id) {
            //return
            //}

            const patient_id = this.state.stream && this.state.stream.getPatient(true)

            if (!patient_id) {
                return
            }

            if (Meteor.settings.public.features.careDays.enabled) {
                // This is actually over-subscribed for patients, experts don't have all the bookings of the patient available.
                // So we subscribe to them here.
                if (Meteor.user()?.isExpert()) {
                    this.subscribe('personalCareDayBookingsForPatient', patient_id)
                }
            }
        })


        /**
         * Subscribe to the messages we want.
         * This can be rerun later if the patient decides to load more messages later.
         *
         * Also we will iterate over all messages and "enrich" it with additional information for the
         * stream display.
         */

        let previousSubscriptionLimitsCache = []

        // shitty async await for both subs complete synchronization! :D
        let regularMessagesSubComplete = false
        let unreadMessagesSubComplete = false

        this.autorun(() => {
            // prevent Error when stream is not available (on logout)
            if (!this.state.stream) {
                return
            }
            // add authorName to messages from the "other side" of the stream - for basically
            // everybody, except for the current user.
            const currentUserId = Meteor.userId()
            if (!currentUserId) {
                return
            }

            if (!this.getTemplateProgressStateHasReachedOrPassed('STREAM_STORED')) {
                return
            }

            /**
             * SUBSCRIBE & PREPARE MESSAGES FOR STREAM
             */
            /**
             * Re-subscribe to previous subscriptions 1:1 because otherwise they'd be ended by the
             * new autorun + all messages would be sent again (because of the higher limit - they'd be sent again but
             * it'd be extra overhead).
             *
             * From the Meteor Docs:
             *
             * If you call Meteor.subscribe within a reactive computation, for example using Tracker.autorun,
             * the subscription will automatically be cancelled when the computation is invalidated or stopped;
             * it’s not necessary to call stop on subscriptions made from inside autorun.
             * However, if the next iteration of your run function subscribes to the same record set (same name and parameters),
             * Meteor is smart enough to skip a wasteful unsubscribe/resubscribe (...)
             *
             * see discussion here also: https://forums.meteor.com/t/does-an-autorun-unsubscribe-a-subscription-if-it-is-not-renewed/15112/3
             */
            _.each(previousSubscriptionLimitsCache, (limit) => {
                this.subscribe('messages', this.state.stream._id, limit)
            })

            previousSubscriptionLimitsCache.push(this.state.limit)
            previousSubscriptionLimitsCache = _.uniq(previousSubscriptionLimitsCache)

            // Double-sub besides the subs-cache so we can wait for the ready using the template ready - method.
            messagesSubsCache.subscribe('messages', this.state.stream._id, this.state.limit)

            const templateInstance = this

            let unreadMessagesSubHandle = this.subscribe('unreadMessages', this.state.stream._id, {
                onStop() {
                    // TODO: DEPRECATED: This could be the case because the subscription doesnt exist before
                    // trusted care server version 3.4.0 . In order to get 3.4.0 online we'll provide
                    // this .stop() to stop the subscription in case of errors so that the template.subscriptionsReady()
                    // will become true even if this subscription fails.
                    unreadMessagesSubHandle.stop()
                    console.error('Problem subscribing to unread messages subscription')

                    // NOTE: duplicated code, see below; remove duplication on next version
                    unreadMessagesSubComplete = true
                    if (unreadMessagesSubComplete && regularMessagesSubComplete) {
                        templateInstance.setTemplateProgressState('FIRST_MESSAGES_SUBSCRIPTIONS_COMPLETE')
                    }

                },
                onReady() {

                    // NOTE: duplicated code, see above; remove duplication on next version
                    unreadMessagesSubComplete = true
                    if (unreadMessagesSubComplete && regularMessagesSubComplete) {
                        templateInstance.setTemplateProgressState('FIRST_MESSAGES_SUBSCRIPTIONS_COMPLETE')
                    }
                },
            })
            messagesSubsCache.subscribe('unreadMessages', this.state.stream._id)
            this.subscribe('messages', this.state.stream._id, this.state.limit, (err) => {
                if (err) {
                    throw new Meteor.Error('Problem subscribing to messages subscription')
                    return
                }
                regularMessagesSubComplete = true
                if (unreadMessagesSubComplete && regularMessagesSubComplete) {
                    this.setTemplateProgressState('FIRST_MESSAGES_SUBSCRIPTIONS_COMPLETE')
                }
            })
            this.setTemplateProgressState('WAIT_FOR_MESSAGES_SUBSCRIPTIONS')
        })

        /**
         * Wait until the messages sub has completed & from then on update the messages in the stream appropriately
         */
        this.autorun((c) => {
            const subsReady = this.subscriptionsReady()
            const firstMessageSubComplete = this.getTemplateProgressStateHasReachedOrPassed('FIRST_MESSAGES_SUBSCRIPTIONS_COMPLETE')

            if (!subsReady || !firstMessageSubComplete) {
                return
            }

            // add authorName to messages from the "other side" of the stream - for basically
            // everybody, except for the current user.
            const currentUserId = Meteor.userId()
            if (!currentUserId) {
                return
            }

            if (!this.state.stream_id) {
                return
            }

            /**
             * All unread messages and those by this.state.limit are published.
             */
            let messages = Collections.Messages.find({
                stream_id: this.state.stream_id,
            }, {
                sort: {
                    time: -1,
                },
            }).fetch()

            this.state.numRawMessages = messages.length

            /**
             * If there are unread messages, raise the limit so that we can display all unread messages.
             */
            const unreadMessages = _.filter(messages, message => {
                // There are some exceptions which shouldn't trigger the unread messages notification, eg. for the initial new stream messages.
                if (message.displayData?.dontCountAsUnreadMessage) {
                    return false
                }
                return message.needsReadStatusUpdate(Meteor.user())
            })
            if (unreadMessages.length && unreadMessages.length > this.state.limit) {
                this.state.limit = unreadMessages.length
            }

            messages = Collections.Messages.find({
                stream_id: this.state.stream_id,
            }, {
                sort: {
                    time: -1,
                },
                limit: this.state.limit,
            }).fetch()

            // reverse to oldest on top, newest on the bottom
            messages.reverse()

            /**
             * Store the first unread message to display a nice "Neue Nachrichten" div in the Stream to scroll to.
             */
            const unreadMessages_ids = _.map(unreadMessages, '_id')
            const firstUnreadMessage = _.find(messages, message => {
                return _.includes(unreadMessages_ids, message._id)
            })
            if (this.state.isFirstStreamLoad) {
                this.state.firstUnreadMessage = firstUnreadMessage
                this.state.unreadMessages = unreadMessages
                this.state.isFirstStreamLoad = false
            }

            /**
             * Add additional information to the messages in the stream
             */

            let isFirstNewDayLine = true
            const monitoringProgressDataDict = {}

            // add day divider date to each message which is the first message
            // of a new day
            messages = _.map(messages, (message, idx) => {
                let previousMessage

                /**
                 * The first newStreamSysMessage contains the welcome animation / kicks off the channel and the
                 * first date should appear on the next message after this one.
                 */
                if ('newStreamSysMessage' === message.type) {
                    return message
                }

                // first day won't have a day before it, so it's a new day by default.
                if (0 !== idx && 'newStreamSysMessage' !== messages[idx - 1]?.type) {
                    previousMessage = messages[idx - 1]
                }

                // check which messages are on new / different days and add formatted date to message
                if (0 === idx || 'newStreamSysMessage' === messages[idx - 1]?.type || moment(message.time).isAfter(previousMessage.time, 'day')) {
                    message.newDay = moment(message.time).format('DD. MMMM YYYY')
                    message.firstNewDayLine = isFirstNewDayLine
                    isFirstNewDayLine = false

                    // check for additional monitoring-related new day information

                    // has there been an active monitoring on the break of the new day?
                    const activeMonitoringOnNewDay = MonitoringService.getActiveMonitoringAtDate(this.state.stream._id, message.time)
                    if (activeMonitoringOnNewDay) {
                        if (!monitoringProgressDataDict[activeMonitoringOnNewDay._id]) {
                            monitoringProgressDataDict[activeMonitoringOnNewDay._id] = activeMonitoringOnNewDay.getMonitoringProgress(false)
                        }

                        const monitoringProgress = monitoringProgressDataDict[activeMonitoringOnNewDay._id]

                        message.newDay_monitoring_active = true

                        message.newDay_monitoring_day = activeMonitoringOnNewDay.getDayOfMonitoringForDate(message.time)
                        const monitoringProgressDay = _.find(monitoringProgress, {day: message.newDay_monitoring_day})

                        message.newDay_monitoring_duration = activeMonitoringOnNewDay.getDuration(false)
                        const adherenceRate = monitoringProgressDay && monitoringProgressDay.adherenceRateInPercent
                        message.newDay_monitoring_hasAdherence = !_.isUndefined(adherenceRate)
                        message.showActivityPercentageInStream = activeMonitoringOnNewDay.getMonitoringTypeConfig().showActivityPercentageInStream
                        message.newDay_monitoring_adherence = adherenceRate
                    }
                }
                return message
            })

            messages = _.map(messages, function(message) {
                if (currentUserId === message.sender_id) {
                    return message
                }
                const author = Meteor.users.findOne(message.sender_id)

                if (author && author.profile && author.profile.firstname) {
                    message.authorName = author.profile.firstname + ' ' + author.profile.lastname
                } else {
                    message.authorName = 'Trusted.Care'
                }

                return message
            })

            /**
             * Image upload specific - show preview image for uploader & filter out uploading images for the user on other
             * devices
             */

            // we'll see which images have local data URIs (images which have been uploaded via this currently running instance
            // of the app) and add those data URIs to those messages

            // we'll filter out messages which are "uploading" but aren't being uploaded on this device (and thusly
            // don't have a local image data URI). This is only relevant if the uploading user is logged in on multiple devices.
            //
            // Other users don't receive the messages until they're uploaded.

            const localMessageImageDataUris_copy = CLIENTFUNCTIONS.localMessageImageDataUris.get()

            messages = _.reject(messages, function(message) {
                // don't reject audio messages during upload
                if ('uploading' === message.status && 'c2c_audioMessage' === message.type) {
                    return false
                }
                return 'uploading' === message.status && !localMessageImageDataUris_copy[message._id]
            })

            messages = _.map(messages, function(message) {
                if (localMessageImageDataUris_copy[message._id]) {
                    message.dataUri = localMessageImageDataUris_copy[message._id].data
                    message.dataUriImageWidth = localMessageImageDataUris_copy[message._id].width
                    message.dataUriImageHeight = localMessageImageDataUris_copy[message._id].height
                }
                return message
            })

            // we also want to make sure that for image messages, we have all the required information to display them in the stream.
            // otherwise we want to wait with displaying them until they're complete.
            //
            // This is so we can wait with rendering the chat bubble until the image thumb is fully available.
            messages = _.filter(messages, function(message) {
                if (message.type !== 'c2c_photo') {
                    return true
                }
                // local images should be complete
                if (message.dataUri) {
                    return true
                }
                // check remote images
                if (!message.external_id) {
                    return false
                }
                const image = Collections.Photos.findOne(message.external_id)

                if (!image || !image.metadata || !image.metadata.thumb) {
                    return false
                }

                const thumbImage = Collections.Photos.findOne(image.metadata.thumb)

                //DV: remove width and height of thumbnail from test as it works without it and is still missing sometimes?
                if (!thumbImage || !thumbImage.metadata /*|| !thumbImage.metadata.width || !thumbImage.metadata.height*/) {
                    return false
                }

                return true
            })

            // All done! :) Store the results.

            this.state.messages = messages

            /**
             * If we were in "load more" - mode, restore the view + scroll the view to the right position
             * after the messages have arrived
             */
            if (this.state.loadMoreInProgress) {
                this.setTimeout(() => {
                    const streamContainer = this.$('.streamchannel').closest('.content')
                    const streamContainerScrollHeight = streamContainer[0].scrollHeight
                    const newScrollTop = streamContainerScrollHeight - this.distanceFromBottomWhenLoadMoreButtonWasPressed
                    streamContainer.scrollTop(newScrollTop)
                    UIBlock.unblock()
                }, 1000)
            }
            this.state.loadMoreInProgress = false

            this.setTemplateProgressState('MESSAGES_READY')
        })

        /**
         * Wait until all subs are ready + Messages are massaged
         */
        this.autorun(async(c) => {
            const subsReady = this.subscriptionsReady()
            const messagesReady = this.getTemplateProgressStateHasReachedOrPassed('MESSAGES_READY')

            if (!subsReady || !messagesReady) {
                return
            }
            this.setTemplateProgressState('ALL_SUBS_AND_MESSAGES_READY')
            c.stop()
        })

        /**
         * Mark messages as read after they have been shown for at least 2 seconds
         */
        const waitHowLongTilMarkMessageAsRead = 2000

        this.autorun(() => {

            // make this run again if new messages are added later on
            const messages = this.state.messages

            if (!this.getTemplateProgressStateHasReachedOrPassed('RENDERED')) {
                return
            }

            // Mark messages as read, only if app is in foreground
            if (Meteor.isCordova && !appIsInForeground.get()) {
                return
            }

            /**
             * Check which messages will have to be marked as read after the timeout...
             */
            let messagesWhichNeedReadStatusUpdate = []
            const user = Meteor.user()

            if (!user) {
                Loggers.services.communication.warn('Stream:no-user-found')
                return
            }

            _.each(messages, (message) => {
                if (!message.needsReadStatusUpdate(user)) {
                    return
                }
                messagesWhichNeedReadStatusUpdate.push(message._id)
            })
            if (messagesWhichNeedReadStatusUpdate.length) {
                // this.setTimeout gets cleaned up automatically if template gets destroyed.
                this.setTimeout(() => {
                    markMessagesAsSeen.call({messageIds: _.uniq(messagesWhichNeedReadStatusUpdate)}, (err, result) => {
                        if (!err) {
                            messagesWhichNeedReadStatusUpdate = []
                        }
                    })
                }, waitHowLongTilMarkMessageAsRead)
            }
        })

        /**
         * finally and once mark every message of patient as read / patient_checked,
         * so that badge counter is 0. markMessagesAsSeen also needed for messages, while
         * patient and expert are both in the stream.
         */
        this.autorun(() => {
            if (!this.getTemplateProgressStateHasReachedOrPassed('RENDERED')) {
                return
            }
            /**
             * On cordova, we want to make sure that messages are only marked as seen while the app is in the foreground.
             * So we will add a check here in case we're in a cordova app that the app is currently in the foreground.
             */
            // Mark messages as read only if app is in foreground
            if (Meteor.isCordova && !appIsInForeground.get()) {
                return
            }

            this.setTimeout(() => {
                if (Meteor.user() && Meteor.user().isPatient()) {
                    markAllMessagesAsSeen.call({stream_id: this.state.stream_id}, (err, result) => {
                        if (err) {
                            Loggers.services.communication.warn('Stream:markAllMessagesAsRead', err)
                        }
                    })
                }
            }, 2000)
        })
    },
    onRendered() {
        // We want to know whether the user "touched the stream" already, eg. might have started scrolling;
        // If he didn't, we add an additional interval / check to make sure the stream is at the bottom
        // after load (see onRendered)
        let userHasTouched = false
        window.addEventListener('touchstart', function onFirstTouch() {
            userHasTouched = true
            window.removeEventListener('touchstart', onFirstTouch, false)
        }, false)

        let userHasScrolled = false

        // used below to check for new messages at the bottom of the stream
        let mostRecentLastMessageInStreamId

        // jump to the bottom of the stream after the first rendering.
        this.autorun(async(c) => {
            if (!this.getTemplateProgressStateHasReachedOrPassed('ALL_SUBS_AND_MESSAGES_READY')) {
                return
            }
            c.stop()

            console.log('🧣🧣🧣🧣🧣🧣')

            /**
             * Wait til the rendering is done, then jump to the bottom afterwards.
             * We could also count the DOM-Elements to make sure all messages have been rendered... but I think this should
             * work as well.
             *
             * Moved into a function so we can call it further down after any initial modals have been handled.
             */
            const finalizingFunction = () => {
                const streamContainer = $('.streamchannel').closest('.content')

                if (streamContainer.length && this.state.jumpToBottomAfterLoad) {
                    streamContainer.scrollTop(streamContainer[0].scrollHeight)
                    /**
                     * Jump either to the first unread message if exists, otherwise to the bottom.
                     */
                    if ($('.js-newMessagesElement').length) {
                        scrollToFirstUnreadMessage()
                    } else {
                        scrollToBottom()
                    }

                }
                // Hide the ui block after we have jumped to the bottom.
                // The defer is there only to let the app breathe a bit...
                Meteor.defer(() => {
                    const messages = this.state.messages
                    // store the most recent message id so we can detect if a new message has arrived layer on
                    if (messages.length) {
                        mostRecentLastMessageInStreamId = messages[messages.length - 1]._id
                    }
                    this.setTemplateProgressState('RENDERED')
                    hasStreamBeenRendered.set(true)

                    Meteor.defer(() => {
                        $('.streamchannel').closest('.content').on('scroll', function onFirstScroll () {
                            userHasScrolled = true
                            $('.streamchannel').closest('.content').off('scroll', onFirstScroll)
                        })
                    })
                })
            }

            /**
             * Show Questionnaire Action Modal for self assessment if the patient visits the stream the first time &
             * the institution has Care & Glow monitorings configured.
             *
             * Also, expert could have filled out questionnaire before, so check for questionnaire.
             *
             * Nit: OnAfterEndCallback: finalizingFunction might be ready before it has loaded all its data.
             * If there is any movement, move the call into the modals subs ready / rendered event.
             */
            const currentUser = await Meteor.userAsync()
            const questionnaire = await Collections.Questionnaires.findOneAsync({stream_id: this.state.stream_id})
            if (currentUser.isPatient() &&
                !questionnaire &&
                !currentUser.patient_hasSeenStreamBefore &&
                 currentUser.getInstitution().hasCareAndGlow) {
                IonModal.open('questionnaireModal_partZero_welcome', {
                    stream: this.state.stream,
                }, undefined, finalizingFunction)
            } else {
                this.setTimeout(finalizingFunction, 100)
            }
        })


        /**
         * Move stream to bottom if it isn't a few times... :)
         * Except if the user has touched the stream since, then we don't want to.
         */
        // jump to the bottom of the stream after the first rendering.
        this.autorun((c) => {
            if (!this.getTemplateProgressStateHasReachedOrPassed('RENDERED')) {
                return
            }
            c.stop()
            if (!this.state.jumpToBottomAfterLoad) {
                return
            }

            let timesToGoDown = 25

            const timesToGoDownInterval = this.setInterval(() => {
                // no more jumping down now!
                if (userHasScrolled || userHasTouched || !timesToGoDown) {
                    try {
                        this.clearInterval(timesToGoDownInterval)
                    } catch (e) {
                        console.error('Strange interval error during testing', e)
                    }
                    return
                }
                // ok, let's jump
                const streamContainer = $('.streamchannel').closest('.content')

                if (streamContainer.length) {
                    streamContainer.scrollTop(streamContainer[0].scrollHeight)
                }
                timesToGoDown -= 1
            }, 200)
        })

        /**
         * Register hook to scroll to bottom of stream every time new messages arrive
         */
        this.autorun(() => {
            const messages = this.state.messages

            if (!this.getTemplateProgressStateHasReachedOrPassed('RENDERED') || !messages.length) {
                return
            }
            const lastMessageInStream = messages[messages.length - 1]

            // no new message at the bottom
            if (mostRecentLastMessageInStreamId === lastMessageInStream._id) {
                return
            }
            // make the new last message the most recent last message...
            mostRecentLastMessageInStreamId = lastMessageInStream._id

            // scroll to the bottom of the stream nicely
            scrollToBottom()
        })

        /**
         * Show a button to confirm that the patient will take part at the appointment.
         * The confirmation status is set by a cron job.
         */

        const alreadyShownForBookingIds = []

        this.autorun((c) => {
            if (!this.getTemplateProgressStateHasReachedOrPassed('ALL_SUBS_AND_MESSAGES_READY')) {
                return
            }

            const stream = this.state.stream

            if (!stream) {
                return
            }

            // fake fetch to make this run reactively in regular intervals
            const now = this.state.now

            const booking = stream.getBooking()
            const shortTalkBooking = stream.getShortTalkBooking()

            if ((booking && 'unconfirmed' === booking.confirmationStatus) ||
                (shortTalkBooking && 'unconfirmed' === shortTalkBooking.confirmationStatus)) {
                const booking_id = booking ? booking._id : shortTalkBooking._id
                if (!alreadyShownForBookingIds.includes(booking_id)) {
                    if (Meteor.user().isPatient()) {
                        IonModal.open('appointmentConfirmationModal', {stream_id: stream._id})
                    }

                    alreadyShownForBookingIds.push(booking_id)
                }
            }
        })

        /**
         * Close an existing appointmentConfirmationModal if it is still open after the booking is over.
         * The confirmation status is set by a cron job.
         */
        const alreadyHiddenForBookingIds = []

        this.autorun((c) => {
            if (!this.getTemplateProgressStateHasReachedOrPassed('ALL_SUBS_AND_MESSAGES_READY')) {
                return
            }

            const stream = this.state.stream

            if (!stream) {
                return
            }

            // fake fetch to make this run reactively in regular intervals
            const now = this.state.now

            const booking = stream.getBooking()
            const shortTalkBooking = stream.getShortTalkBooking()
            if ((booking && 'passed' === booking.confirmationStatus) ||
                (shortTalkBooking && 'passed' === shortTalkBooking.confirmationStatus)) {
                const booking_id = booking ? booking._id : shortTalkBooking._id
                if (!alreadyHiddenForBookingIds.includes(booking_id)) {
                    if (Meteor.user().isPatient()) {
                        IonModal.close('appointmentConfirmationModal')
                    }

                    alreadyHiddenForBookingIds.push(booking_id)
                }
            }
        })
    },
    helpers: {
        doesPatientHaveActiveAndCurrentBooking() {
            const currentUser = Meteor.user()
            // fake fetch to make this run reactively in regular intervals
            const now = this.state.now
            if (!currentUser || !currentUser.isPatient()) {
                return
            }
            return this.state.stream && this.state.stream.hasActiveAndCurrentBooking()
        },
        hasMoreMessages: function() {
            return this.state.loadMoreInProgress || (this.state.numRawMessages >= this.state.limit)
        },
        areWeInThatAwkwardPhaseWhereASelfAssessmentHasBeenStartedButTheMonitoringHasntYet() {
            // Wait until stream is ready
            if (!this.state.stream) {
                return
            }
            if (!this.state.stream.getMostRecentPastMonitoring()) {
                return
            }

            if ('care_x_ibiotics_assessment' === this.state.stream.getMostRecentPastMonitoring().monitoringTypeKey) {
                return this.state.stream.getMostRecentPastMonitoring().assessmentMonitoringFinishedSuccessfully &&
                    ('care_x_ibiotics_assessment' === this.state.stream.getMostRecentPastMonitoring().monitoringTypeKey) &&
                    !this.state.stream.getMostRecentPastMonitoring().cancelledWhileBetweenTwoPartMonitoringMonitorings
            } else {
                // There is no self Assessment in the CG, so we can skip that.
                return false
            }
        },
        /**
         * If customer has questionnaire, expert can start the monitoring.
         *
         * We only check for this, if questionnaire is required via Staff Area per Institution.
         */
        hasCareAndGlowQuestionnaire() {
            const institution = this.state.stream?.getInstitution()
            if (!institution) {
                return false
            }
            if (!institution.isQuestionnaireRequired) {
                return true
            }
            return Collections.Questionnaires.findOne({stream_id: this.state.stream_id, isCompleted: true})
        },
    },
    events: {
        // reset the notification flags for the stream.
        'click .toggleStreamUpdatesChecked'(e) {
            clearExpertUnreadFlagsForStream.call({stream_id: this.state.stream._id})
        },
        'click #loadMore'(e) {
            e.preventDefault()
            UIBlock.block()

            this.state.loadMoreInProgress = true

            // calculate scroll view position from bottom to be able to
            // keep the stream scroll position where it was while the
            // new items are being loaded
            const streamContainer = this.$('.streamchannel').closest('.content')
            if (streamContainer.length) {
                this.distanceFromBottomWhenLoadMoreButtonWasPressed = streamContainer[0].scrollHeight - streamContainer.scrollTop()
            }

            // get current value for limit, i.e. how many messages are currently displayed
            let limit = this.state.limit
            limit += Meteor.settings.public.stream.num_load_more_messages
            this.state.limit = limit
        },
        /**
         * Button "Programm auswählen" or "ibiotics CARE starten" or "Care And Glow starten"
         */
        'click .js-openMonitoring'(e) {
            e.preventDefault()
            const stream_id = this.state.stream._id

            IonModal.open('monitoringType_select', {
                stream_id,
            })
        },
        'click .js-open-modal-customer-documentation'(e) {
            e.preventDefault()
            IonModal.open('modal_customer_documentation')
        },
        'click .js-open-weekly-skin-status'(e) {
            e.preventDefault()
            IonModal.open('weekly_skin_status')
        },
        'click .js-open-weekly-stream-element'(e) {
            e.preventDefault()
            IonModal.open('weekly_stream_element')
        },
        'click .js-openFollowingMonitoring'(e) {
            e.preventDefault()

            const mostRecentMonitoring = this.state.stream?.getMostRecentMonitoring()

            const monitoringTypeKey = MonitoringService.getMonitoringTypeConfig(mostRecentMonitoring?.monitoringTypeKey)?.followingMonitoring
            const stream_id = this.state.stream._id

            const monitoringTypeConfig = MonitoringService.getMonitoringTypeConfig(monitoringTypeKey)
            IonModal.open('monitoring_' + monitoringTypeConfig.monitoringConfigurationInterface, {stream_id, monitoringTypeKey})
        },
        'click .js-endMonitoring'(e) {
            e.preventDefault()

            const stream_id = this.state.stream._id

            const isInPatientRetentionPhase = Meteor.settings.public.features.patientRetentionPhase.enabled &&
                aget(this, 'state.stream.getMostRecentMonitoring.isInPatientRetentionPhase')

            const title = isInPatientRetentionPhase ? 'Bindungsphase beenden' : 'Monitoring beenden'
            const text =  isInPatientRetentionPhase ?
                'Bist Du sicher, dass Du die laufende Bindungsphase beenden möchtest?' :
                'Bist Du sicher, dass Du das laufende Monitoring beenden möchtest?'

            const okText = isInPatientRetentionPhase ? 'Bindungsphase beenden' : 'Monitoring beenden'

            IonPopup.confirm({
                title,
                text,
                cancelText: 'Abbrechen',
                okText,
                onOk() {
                    if (isInPatientRetentionPhase) {
                        endPatientRetentionPhase.call({stream_id}, (error, result) => {
                            if (error) {
                                Logger.warn('error, result', error, result)

                                IonPopup.alert({
                                    title: 'Ein Fehler ist aufgetreten',
                                    text: error,
                                })
                            }
                        })

                        // in Patient Retention Phase, there is no active monitoring to end, so we stop here.
                        return
                    }

                    endMonitoring.call({stream_id, cancelled: true}, (error, result) => {
                        if (error) {
                            log('error, result', error, result)
                        }
                        if (error) {
                            IonPopup.alert({
                                title: 'Ein Fehler ist aufgetreten',
                                text: error,
                            })
                        }
                    })
                },
            })
        },

        /**
         * This is a "fake" end monitoring - Individual Routine consists of two monitorings, one after the other.
         * To be able to resume without a monitoring / to allow the expert to start a new monitoring, we need to give the
         * expert the opportunity to "exit" from between the two parts of the monitoring.
         */
        'click .js-endMonitoring-individualRoutine'(e) {
            e.preventDefault()

            const stream_id = this.state.stream._id

            IonPopup.confirm({
                title: 'Monitoring beenden',
                text: 'Bist Du sicher, dass Du das laufende Monitoring beenden möchtest?',
                cancelText: 'Abbrechen',
                okText: 'Monitoring beenden',
                onOk() {
                    endMonitoring.call({stream_id, cancelled: true, cancelledWhileBetweenTwoPartMonitoringMonitorings: true}, (error, result) => {
                        if (error) {
                            log('error, result', error, result)

                            IonPopup.alert({
                                title: 'Ein Fehler ist aufgetreten',
                                text: error,
                            })
                        }
                    })
                },
            })
        },
        'click .js-goToBookNewAppointment'(e) {
            e.preventDefault()

            // Customer must answer questionnaire first.
            const questionnaire = Collections.Questionnaires.findOne({stream_id: this.state.stream_id, isCompleted: true})
            if (this.state.stream.getInstitution()?.isQuestionnaireRequired && !questionnaire) {
                IonModal.open('customerInformation_answerQuestionnaireFirst')
            } else {
                IonModal.open('bookAppointmentModal')
            }
        },
        'click .js-goToBookNewShortTalkAppointment'(e) {
            e.preventDefault()

            /**
             * Customers must answer the questionnaire first if it is required for the isntitution.
             */
            const questionnaire = Collections.Questionnaires.findOne({stream_id: this.state.stream_id, isCompleted: true})
            if (this.state.stream.getInstitution()?.isQuestionnaireRequired && !questionnaire) {
                IonModal.open('customerInformation_answerQuestionnaireFirst')
            } else {
                IonModal.open('bookShortTalkAppointmentModal')
            }
        },
        'click .js-cancelBooking'(e) {
            e.preventDefault()

            const booking = this.state.stream.getBooking()
            if (!booking) {
                return
            }
            const confirmationText = ''

            IonPopup.confirm({
                title: 'Termin absagen',
                text: confirmationText,
                cancelText: 'Abbrechen',
                okText: 'Termin absagen',
                onOk() {
                    bookings_cancelBooking.call({booking_id: booking._id})
                },
            })
        },
        'click .js-markAppointmentKept'(e) {
            e.preventDefault()

            const booking = this.state.stream.getBooking()
            if (!booking) {
                return
            }
            bookings_markAppointmentKept.call({booking_id: booking._id})
        },
        'click .js-videoChat'(e) {
            e.preventDefault()

            startCall()
        },
        'click .js-cancelShortTalkBookingBottomButton'(e, t) {
            e.preventDefault()

            const stream_id = this.state.stream._id
            const stream = Collections.Streams.findOne(stream_id)
            const shortTalkBooking = stream.getShortTalkBooking()
            const confirmationText = ''


            const self = t

            IonPopup.confirm({
                title: 'Termin absagen',
                text: confirmationText,
                cancelText: 'Abbrechen',
                okText: 'Termin absagen',
                onOk() {
                    Meteor.call('TC.services.appointmentBooking.cancelShortTalkAppointment', {booking_id: shortTalkBooking._id, patient_id: Meteor.userId()}, (error, result) => {
                        if (error) {
                            toastr.error('Leider ist ein Fehler aufgetreten.')
                            Loggers.services.communication.error('stream.cancelShortTalkAppointment', {error})
                            return
                        }

                        self.$('.js-cancelShortTalkBooking').attr('disabled', 'disabled')
                    })
                },
            })
        },
    },
})

`;

const { code } = babel.transform(sourceCode, {
    plugins: [myPlugin]});

console.log(code);
