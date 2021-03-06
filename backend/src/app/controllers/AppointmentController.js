import * as Yup from "yup";
import { startOfHour, parseISO, isBefore, format, subHours } from "date-fns";
import pt from "date-fns/locale/pt";
import Appointment from "../models/Appointment";
import User from "../models/User";
import File from "../models/File";
import Notification from "../schemas/Notification";
import Mail from "../../lib/Mail";
class AppointmentController {
  async index(req, res) {
    const { page = 1 } = req.query;

    const appointments = await Appointment.findAll({
      where: {
        user_id: req.userId,
        canceled_at: null,
      },
      order: ["date"],
      attributes: ["id", "date", "past", "cancelable"],
      limit: 20,
      offset: (page - 1) * 20,
      include: [
        {
          model: User,
          as: "provider",
          attributes: ["id", "name"],
          include: [
            {
              model: File,
              as: "avatar",
              attributes: ["id", "path", "url"],
            },
          ],
        },
      ],
    });
    return res.json(appointments);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({
        error: "Validation fails",
      });
    }

    const { provider_id, date } = req.body;

    
    if (provider_id === req.userId) {
      return res
        .status(401)
        .json({ error: "Você não pode criar compromissos consigo mesmo" });
    }

    
    const isProvider = await User.findOne({
      where: { id: provider_id, provider: true },
    });

    if (!isProvider) {
      return res
        .status(401)
        .json({ error: "Você só pode criar compromissos com provedores" });
    }

    const hourStart = startOfHour(parseISO(date));


    if (isBefore(hourStart, new Date()))
      return res.status(400).json({ error: "Data anterior não é permitida" });


    const checkAvailability = await Appointment.findOne({
      where: {
        provider_id,
        canceled_at: null,
        date: hourStart,
      },
    });

    if (checkAvailability) {
      return res
        .status(400)
        .json({ error: "A data do agendamento não está disponível" });
    }

    const appointment = await Appointment.create({
      user_id: req.userId,
      provider_id,
      date,
    });

   
    const user = await User.findByPk(req.userId);

    const formattedDate = format(
      hourStart,
      "'dia' dd 'de' MMMM', às' H:mm'h'",
      { locale: pt }
    );

    await Notification.create({
      content: `Novo agendamento de ${user.name} para o ${formattedDate}`,
      user: provider_id,
    });

    return res.json(appointment);
  }

  async delete(req, res) {
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: "provider",
          attributes: ["name", "email"],
        },
        {
          model: User,
          as: "user",
          attributes: ["name"],
        },
      ],
    });

    if (appointment.user_id !== req.userId) {
      return res.status(401).json({
        error: "Você não tem permissão para cancelar este compromisso.",
      });
    }

    const dateWithSub = subHours(appointment.date, 6);
    const now = new Date();
    if (isBefore(dateWithSub, now)) {
      return res.status(401).json({
        error: "Você só pode cancelar o agendamento com 6 horas de antecedência.",
      });
    }

    appointment.canceled_at = now;

    await appointment.save();

    await Mail.sendMail({
      to: `${appointment.provider.name} <${appointment.provider.email}>`,
      subject: "Agendamento cancelado",
      template: "cancellation",
      context: {
        provider: appointment.provider.name,
        user: appointment.user.name,
        date: format(appointment.date, "'dia' dd 'de' MMMM', às' H:mm'h'", {
          locale: pt,
        }),
      },
    });

    return res.json(appointment);
  }
}

export default new AppointmentController();