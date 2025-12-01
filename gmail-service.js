const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

class GmailService {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GMAIL_CLIENT_ID,
            process.env.GMAIL_CLIENT_SECRET,
            process.env.GMAIL_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
        );
        
        // Устанавливаем refresh token
        this.oauth2Client.setCredentials({
            refresh_token: process.env.GMAIL_REFRESH_TOKEN
        });
    }

    async createTransporter() {
        try {
            // Получаем новый access token
            const { token } = await this.oauth2Client.getAccessToken();
            
            if (!token) {
                throw new Error('Failed to get access token');
            }

            return nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    type: 'OAuth2',
                    user: process.env.GMAIL_USER,
                    clientId: process.env.GMAIL_CLIENT_ID,
                    clientSecret: process.env.GMAIL_CLIENT_SECRET,
                    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
                    accessToken: token
                }
            });
        } catch (error) {
            console.error('❌ Error creating Gmail transporter:', error);
            throw error;
        }
    }

    async sendVerificationEmail(email, verificationToken) {
        try {
            const transporter = await this.createTransporter();
            const verificationLink = `${process.env.SERVER_URL || 'http://localhost:5000'}/verify-email.html?token=${verificationToken}`;
            
            const mailOptions = {
                from: `"Sudu System" <${process.env.GMAIL_USER}>`,
                to: email,
                subject: 'Подтверждение email - СУДУ',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px; border-radius: 10px;">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <h2 style="color: #6A5ACD; margin: 0;">СУДУ</h2>
                            <p style="color: #666; margin: 5px 0;">Система управления учебным процессом</p>
                        </div>
                        
                        <div style="background: white; padding: 25px; border-radius: 8px; border: 1px solid #e0e0e0;">
                            <h3 style="color: #333; margin-bottom: 15px;">Добро пожаловать в СУДУ!</h3>
                            <p style="color: #666; line-height: 1.5; margin-bottom: 20px;">
                                Для завершения регистрации и активации вашего аккаунта подтвердите ваш email адрес.
                            </p>
                            
                            <div style="text-align: center; margin: 25px 0;">
                                <a href="${verificationLink}" 
                                   style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #6A5ACD, #8A2BE2); 
                                          color: white; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px;">
                                    Подтвердить Email
                                </a>
                            </div>
                            
                            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
                                Если вы не регистрировались в СУДУ, проигнорируйте это письмо.
                            </p>
                        </div>
                        
                        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
                            <p>© 2024 СУДУ. Все права защищены.</p>
                        </div>
                    </div>
                `
            };

            const result = await transporter.sendMail(mailOptions);
            console.log('✅ Verification email sent to:', email);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('❌ Error sending verification email:', error);
            return { success: false, error: error.message };
        }
    }

    async sendPasswordResetEmail(email, resetToken) {
        try {
            const transporter = await this.createTransporter();
            const resetLink = `${process.env.SERVER_URL || 'http://localhost:5000'}/reset-password.html?token=${resetToken}`;
            
            const mailOptions = {
                from: `"Sudu System" <${process.env.GMAIL_USER}>`,
                to: email,
                subject: 'Восстановление пароля - СУДУ',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px; border-radius: 10px;">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <h2 style="color: #6A5ACD; margin: 0;">СУДУ</h2>
                            <p style="color: #666; margin: 5px 0;">Восстановление доступа</p>
                        </div>
                        
                        <div style="background: white; padding: 25px; border-radius: 8px; border: 1px solid #e0e0e0;">
                            <h3 style="color: #333; margin-bottom: 15px;">Восстановление пароля</h3>
                            <p style="color: #666; line-height: 1.5; margin-bottom: 20px;">
                                Для восстановления доступа к вашему аккаунту перейдите по ссылке ниже:
                            </p>
                            
                            <div style="text-align: center; margin: 25px 0;">
                                <a href="${resetLink}" 
                                   style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #007bff, #0056b3); 
                                          color: white; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px;">
                                    Восстановить пароль
                                </a>
                            </div>
                            
                            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
                                Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.<br>
                                Ссылка действительна в течение 1 часа.
                            </p>
                        </div>
                        
                        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
                            <p>© 2024 СУДУ. Все права защищены.</p>
                        </div>
                    </div>
                `
            };

            const result = await transporter.sendMail(mailOptions);
            console.log('✅ Password reset email sent to:', email);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('❌ Error sending password reset email:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = GmailService;