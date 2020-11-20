/*
 * Copyright (c) 2020 Bowser65
 * Licensed under the Open Software License version 3.0
 */
const ChildLogger = require('leekslazylogger-express');
const log = new ChildLogger();

const fit = require('./public/src/commons/fit');

class FormatterWarning extends Error {
	constructor(text) {
		super(text);
		this.name = 'FormatterWarning';
	}	
}

const SystemProcessed = Symbol('formatter.system')
Object.defineProperty(global, '__stack', {
	get: function () {
		var orig = Error.prepareStackTrace;
		Error.prepareStackTrace = function (_, stack) { return stack; };
		var err = new Error;
		Error.captureStackTrace(err, arguments.callee);
		var stack = err.stack;
		Error.prepareStackTrace = orig;
		return stack;
	}
});

Object.defineProperty(global, '__line', {
	get: function () {
		return __stack[1].getLineNumber();
	}
});
module.exports = class Formatter {
	constructor (payload, strict) {
		this.payload = payload;
		this.strict = strict;
	}

	report(line) {
		log.warn(`Formatting error (${line})`);
		if (this.strict)
			return true;
	}

	async format () {
		if (!this._validate()) {
			return null;
		}

		await this._formatAttachments();
		this._mergeEmbeds();
		this._formatEmbeds();
		await this._formatMessages();
		return this.payload;
	}

	async _formatAttachments () {
		for (const i1 in this.payload.messages) {
			// noinspection JSUnfilteredForInLoop
			for (const i2 in this.payload.messages[i1].attachments) {
				// noinspection JSUnfilteredForInLoop
				const attachment = this.payload.messages[i1].attachments[i2];
				if (attachment.width && attachment.height) {
					const size = fit(attachment.width, attachment.height, 400, 300);
					attachment.displayMaxWidth = `${size.width}px`;
					attachment.displayMaxHeight = `${size.height}px`;
				}

				attachment.formattedBytes = this._formatBytes(attachment.size);
				attachment.iconHash = this._computeIconHash(attachment.filename);
			}
		}
	}

	_mergeEmbeds () {
		for (const i1 in this.payload.messages) {
			// noinspection JSUnfilteredForInLoop
			if (this.payload.messages[i1].embeds) {
				// noinspection JSUnfilteredForInLoop
				const msg = this.payload.messages[i1];
				const { embeds } = msg;
				msg.embeds = [];
				embeds.forEach(embed => {
					if (embed.url && embed.image) {
						const match = msg.embeds.find(e => e.url === embed.url);
						if (match) {
							if (!match.images) {
								match.images = [];
								if (match.image) match.images.push(match.image);
							}
							if (embed.image) match.images.push(embed.image);
							return;
						}
					}
					msg.embeds.push(embed);
				});
			}
		}
	}

	_formatEmbeds () {
		for (const i1 in this.payload.messages) {
			// noinspection JSUnfilteredForInLoop
			for (const i2 in this.payload.messages[i1].embeds) {
				// noinspection JSUnfilteredForInLoop
				const embed = this.payload.messages[i1].embeds[i2];

				// Group images
				if (embed.images) {
					embed.grouppedImages = [ [], [] ];
					embed.images.forEach((img, i) => embed.grouppedImages[embed.images.length - i <= 2 ? 1 : 0].push(img));
				}

				// Group fields
				if (embed.fields) {
					let cursor = -1;
					const limit = embed.thumbnail ? 2 : 3;
					embed.grouppedFields = [];
					embed.fields.forEach(field => {
						const lastField = cursor !== -1 ? [ ...embed.grouppedFields[cursor] ].reverse()[0] : null;
						if (!lastField || !lastField.inline || !field.inline || embed.grouppedFields[cursor].length === limit) {
							embed.grouppedFields.push([]);
							cursor++;
						}
						embed.grouppedFields[cursor].push(field);
					});
				}

				// Compute display width
				embed.displayMaxWidth = '520px';
				const media = embed.image || embed.video;
				if (media) {
					const size = fit(media.width, media.height, 400, 300);
					embed.displayMaxWidth = `${size.width + 32}px`;
					embed.displayMaxHeight = `${size.height}px`;
				}
				if (embed.image) {
					const size = fit(embed.image.width, embed.image.height, 400, 300);
					embed.image.displayMaxWidth = `${size.width}px`;
					embed.image.displayMaxHeight = `${size.height}px`;
				}
				if (embed.type === 'image' && embed.thumbnail) {
					const size = fit(embed.thumbnail.width, embed.thumbnail.height, 400, 300);
					embed.thumbnail.displayMaxWidth = `${size.width}px`;
					embed.thumbnail.displayMaxHeight = `${size.height}px`;
				}
				if (embed.video) {
					const size = fit(embed.video.width, embed.video.height, 400, 300);
					embed.video.displayMaxWidth = `${size.width}px`;
					embed.video.displayMaxHeight = `${size.height}px`;
				}
			}
		}
	}

	async _formatMessages () {
		let cursor = -1;
		this.payload.grouppedMessages = [];
		for (const msg of this.payload.messages) {
			if (msg.content) {
				await this._parseInvites(msg);
			}
			if (msg.type && msg.type !== 0) {
				msg.content = this._getSystemMessageText(msg);
			}
			const lastMessage = cursor !== -1 ? [ ...this.payload.grouppedMessages[cursor] ].reverse()[0] : null;
			if (!lastMessage || msg.deleted || lastMessage.deleted || (!((lastMessage.type || 0) !== 0 && (msg.type || 0) !== 0) && (
				!((lastMessage.type || 0) === 0 && (msg.type || 0) === 0) ||
        msg.author !== lastMessage.author || msg.time - lastMessage.time > 420000
			))) {
				this.payload.grouppedMessages.push([]);
				cursor++;
			}
			this.payload.grouppedMessages[cursor].push(msg);
		}
		this.payload.grouppedMessages = this.payload.grouppedMessages.filter(a => a.length !== 0);
	}

	async _parseInvites (msg) {
		msg.invites = [];
		const regex = /(?: |^)(?:https?:\/\/)?discord\.gg\/([a-zA-Z0-9-]+)/g;
		for (const match of msg.content.matchAll(regex)) {
			msg.invites.push(match[1]);
		}
	}

	_validate () {
		// if (this.report(__line)) return false
		// Root structure
		if (typeof this.payload.entities !== 'object') return false;
		if (typeof this.payload.messages !== 'object') return false;
		if (!Array.isArray(this.payload.messages)) this.report(__line);
		if (typeof this.payload.ticket !== 'object') return false;
		if (typeof this.payload.ticket.name !== 'string') this.report(__line);

		// Entities
		if (typeof this.payload.entities.users !== 'object') return false;
		if (typeof this.payload.entities.channels !== 'object') return false;
		if (typeof this.payload.entities.roles !== 'object') return false;

		// Entities.Users
		for (const user of Object.values(this.payload.entities.users)) {
			if (typeof user.avatar !== 'string') this.report(__line);
			if (typeof user.username !== 'string') this.report(__line);
			if (typeof user.discriminator !== 'string') this.report(__line);
			if (user.badge && typeof user.badge !== 'string') this.report(__line);
		}

		// Entities.Channels
		for (const channel of Object.values(this.payload.entities.channels)) {
			if (typeof channel.name !== 'string') this.report(__line);
		}

		// Entities.Roles
		for (const role of Object.values(this.payload.entities.roles)) {
			if (typeof role.name !== 'string') this.report(__line);
			if (role.color && typeof role.color !== 'number') this.report(__line);
		}
	
		// Messages
		for (const message of this.payload.messages) {
			if (typeof message.id !== 'string') this.report(__line);
			if (message.type && (typeof message.type !== 'number' || message.type < 0 || message.type > 15)) this.report(__line);
			if (typeof message.author !== 'string') this.report(__line);
			if (typeof message.time !== 'number') this.report(__line);
			if (typeof message.deleted !== 'undefined' && typeof message.deleted !== 'boolean') this.report(__line);
			if (message.content && typeof message.content !== 'string') this.report(__line);
			if (message.embeds && (typeof message.embeds !== 'object' || !Array.isArray(message.embeds))) this.report(__line);
			if (message.attachments && (typeof message.attachments !== 'object' || !Array.isArray(message.attachments))) this.report(__line);

			// For type 0, least 1 embed OR 1 attachment OR contents
			if (
				(!message.type || message.type === 0) &&
        !message.content &&
        (!message.embeds || message.embeds.length === 0) &&
        (!message.attachments || message.attachments.length === 0)
      ) {
        this.report(__line);
      }

      // Messages.Embeds
      if (message.embeds) {
        for (const embed of message.embeds) {
          // Messages.Embeds.Timestamp
          if (embed.timestamp && typeof embed.timestamp !== 'string') this.report(__line);

          // Messages.Embeds.Provider
          if (embed.provider && typeof embed.provider !== 'object') this.report(__line);
          if (embed.provider) {
            if (embed.provider.name && typeof embed.provider.name !== 'string') this.report(__line);
            if (embed.provider.url && typeof embed.provider.url !== 'string') this.report(__line);
          }

          // Messages.Embeds.Author
          if (embed.author && typeof embed.author !== 'object') this.report(__line);
          if (embed.author) {
            if (embed.author.name && typeof embed.author.name !== 'string') this.report(__line);
            if (embed.author.url && typeof embed.author.url !== 'string') this.report(__line);
            if (embed.author.icon_url && typeof embed.author.icon_url !== 'string') this.report(__line);
            if (embed.author.icon_proxy_url && typeof embed.author.icon_proxy_url !== 'string') this.report(__line);
          }

          // Messages.Embeds.Description
          if (embed.description && typeof embed.description !== 'string') this.report(__line);

          // Messages.Embeds.Fields
          if (embed.fields && (typeof embed.fields !== 'object' || !Array.isArray(embed.fields))) this.report(__line);
          if (embed.fields) {
            for (const field of embed.fields) {
              if (typeof field.name !== 'string') this.report(__line);
              if (typeof field.value !== 'string') this.report(__line);
              if (![ 'undefined', 'boolean' ].includes(typeof field.inline)) this.report(__line);
            }
          }

          // Messages.Embeds.Thumbnail
          // Messages.Embeds.Image
          [ 'thumbnail', 'image' ].forEach(field => {
            if (embed[field] && typeof embed[field] !== 'object') this.report(__line);
            if (embed[field]) {
              if (embed[field].url && typeof embed[field].url !== 'string') this.report(__line);
              if (embed[field].proxy_url && typeof embed[field].proxy_url !== 'string') this.report(__line);
              if (embed[field].width && typeof embed[field].width !== 'number') this.report(__line);
              if (embed[field].height && typeof embed[field].height !== 'number') this.report(__line);
            }
          })

          // Messages.Embeds.Video
          if (embed.video && typeof embed.video !== 'object') this.report(__line);
          if (embed.video) {
            if (embed.video.url && typeof embed.video.url !== 'string') this.report(__line);
            if (embed.video.width && typeof embed.video.width !== 'number') this.report(__line);
            if (embed.video.height && typeof embed.video.height !== 'number') this.report(__line);
          }

          // Messages.Embeds.Url
          if (embed.url && typeof embed.url !== 'string') this.report(__line);

          // Messages.Embeds.Footer
          if (embed.footer && typeof embed.footer !== 'object') this.report(__line);
          if (embed.footer) {
            if (embed.footer.text && typeof embed.footer.text !== 'string') this.report(__line);
            if (embed.footer.icon_url && typeof embed.footer.icon_url !== 'string') this.report(__line);
            if (embed.footer.icon_proxy_url && typeof embed.footer.icon_proxy_url !== 'string') this.report(__line);
          }
        }
      }

      // Messages.Attachments
      if (message.attachments && (typeof message.attachments !== 'object' || !Array.isArray(message.attachments))) this.report(__line);
      if (message.attachments) {
        for (const attachment of message.attachments) {
          if (typeof attachment.filename !== 'string') this.report(__line);
          if (typeof attachment.size !== 'number') this.report(__line);
          if (typeof attachment.url !== 'string') this.report(__line);
          if (typeof attachment.proxy_url !== 'string') this.report(__line);
          if (attachment.width && typeof attachment.width !== 'number') this.report(__line);
          if (attachment.height && typeof attachment.height !== 'number') this.report(__line);
        }
      }
    }
    return true
  }

  _getSystemMessageText (msg) {
    if (msg[SystemProcessed]) return msg.content
    msg[SystemProcessed] = true

    switch (msg.type) {
      case 1: // Recipient add
        return `<@${msg.author}> added someone.`
      case 2: // Recipient removal
        return `<@${msg.author}> removed someone.`
      case 3: // Call
        return `<@${msg.author}> started a call.`
      case 4: // Channel name change
        return `<@${msg.author}> changed the channel name: ${msg.content}`
      case 5: // Channel icon change
        return `<@${msg.author}> changed the channel icon.`
      case 6: // Message pinned
        return `<@${msg.author}> pinned a message to this channel.`
      case 7: // Welcome message
        return this._computeWelcomeMessage(msg)
      case 8: // Nitro boost
        if (msg.content) {
          return `<@${msg.author}> just boosted the server ${msg.content} times!`
        }
        return `<@${msg.author}> just boosted the server!`
      case 9: // Nitro boost (lvl up)
      case 10:
      case 11:
        if (msg.content) {
          return `<@${msg.author}> just boosted the server ${msg.content} times! This server has achieved **Level ${msg.type - 8}!**`
        }
        return `<@${msg.author}> just boosted the server! This server has achieved **Level ${msg.type - 8}!**`
      case 12: // Channel following
        return `<@${msg.author}> has added ${msg.content} to this channel`
      case 14: // Server Discovery bad
        return 'This server has been removed from Server Discovery because it no longer passes all the requirements. Check Server Settings for more details.'
      case 15: // Server Discovery good
        return 'This server is eligible for Server Discovery again and has been automatically relisted!'
    }
  }

  _computeWelcomeMessage (msg) {
    const messages = [
      '<@%user%> joined the party.', // -5956206959001600000
      '<@%user%> is here.', // -5956206958997405696
      'Welcome, <@%user%>. We hope you brought pizza.', // -5956206958993211392
      'A wild <@%user%> appeared.', // -5956206958989017088
      '<@%user%> just landed.', // -5956206958984822784
      '<@%user%> just slid into the server.', // -5956206958980628480
      '<@%user%> just showed up!', // -5956206958976434176
      'Welcome <@%user%>. Say hi!', // -5956206958972239872
      '<@%user%> hopped into the server.', // -5956206958968045568
      'Everyone welcome <@%user%>!', // -5956206958963851264
      'Glad you\'re here, <@%user%>.', // -5956206958959656960
      'Good to see you, <@%user%>.', // -5956206958955462656
      'Yay you made it, <@%user%>!' // -5956206958951268352
    ]


    const date = Number((BigInt(msg.id) >> 22n) + 1420070400000n)
    return messages[~~(date % messages.length)].replace(/%user%/g, msg.author)
  }

  _formatBytes (bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = [ 'B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB' ]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  _computeIconHash (filename) {
    if (/\.pdf$/.test(filename)) {
      return 'f167b4196f02faf2dc2e7eb266a24275'
    }
    if (/\.ae/.test(filename)) {
      return '982bd8aedd89b0607f492d1175b3b3a5'
    }
    if (/\.sketch$/.test(filename)) {
      return 'f812168e543235a62b9f6deb2b094948'
    }
    if (/\.ai$/.test(filename)) {
      return '03ad68e1f4d47f2671d629cfeac048ef'
    }
    if (/\.(?:rar|zip|7z|tar|tar\.gz)$/.test(filename)) {
      return '73d212e3701483c36a4660b28ac15b62'
    }
    if (/\.(?:c\+\+|cpp|cc|c|h|hpp|mm|m|json|js|rb|rake|py|asm|fs|pyc|dtd|cgi|bat|rss|java|graphml|idb|lua|o|gml|prl|sls|conf|cmake|make|sln|vbe|cxx|wbf|vbs|r|wml|php|bash|applescript|fcgi|yaml|ex|exs|sh|ml|actionscript)$/.test(filename)) {
      return '481aa700fab464f2332ca9b5f4eb6ba4'
    }
    if (/\.(?:txt|rtf|doc|docx|md|pages|ppt|pptx|pptm|key|log)$/.test(filename)) {
      return '85f7a4063578f6e0e2c73f60bca0fcce'
    }
    if (/\.(?:xls|xlsx|numbers|csv)$/.test(filename)) {
      return '85f7a4063578f6e0e2c73f60bca0fcce'
    }
    if (/\.(?:html|xhtml|htm|js|xml|xls|xsd|css|styl)$/.test(filename)) {
      return 'a11e895b46cde503a094dd31641060a6'
    }
    if (/\.(?:mp3|ogg|wav|flac)$/.test(filename)) {
      return '5b0da31dc2b00717c1e35fb1f84f9b9b'
    }
    return '985ea67d2edab4424c62009886f12e44'
  }
}
