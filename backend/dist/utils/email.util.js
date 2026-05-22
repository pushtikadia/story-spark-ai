"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVerificationEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_1 = __importDefault(require("../config"));
const sendVerificationEmail = (to, token) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!config_1.default.verify_email || !config_1.default.verify_password) {
        console.warn("Email configuration missing. Verification email not sent.");
        return;
    }
    const transporter = nodemailer_1.default.createTransport({
        service: "gmail",
        auth: {
            user: config_1.default.verify_email,
            pass: config_1.default.verify_password,
        },
    });
    const frontendUrl = ((_a = config_1.default.cors_origins) === null || _a === void 0 ? void 0 : _a[0]) || "http://localhost:4001";
    const verifyLink = `${frontendUrl}/verify-newsletter?token=${token}`;
    const mailOptions = {
        from: `"Story Spark AI" <${config_1.default.verify_email}>`,
        to,
        subject: "Verify your Newsletter Subscription",
        html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Welcome to the Story Spark AI Newsletter!</h2>
        <p>Thank you for subscribing. Please verify your email address to confirm your subscription by clicking the button below:</p>
        <p style="margin: 30px 0;">
          <a href="${verifyLink}" style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Verify Email Address</a>
        </p>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p><a href="${verifyLink}" style="color: #6366f1;">${verifyLink}</a></p>
        <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">Best regards,<br/>The Story Spark AI Team</p>
      </div>
    `,
    };
    try {
        yield transporter.sendMail(mailOptions);
    }
    catch (error) {
        console.error("Error sending verification email:", error);
        // Don't throw an error here, so we don't break the subscription flow if email fails.
        // The user record will still be created and they can request another verification if needed.
    }
});
exports.sendVerificationEmail = sendVerificationEmail;
